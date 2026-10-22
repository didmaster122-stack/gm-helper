import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { pickFiles } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { MentionedIn, mentionName } from "../../shared/mentions";
import { ArtPicker, artName } from "../library";
import { IMAGE_EXTENSIONS } from "./domain/attachments";
import { docPlainText, parseDoc, serializeDoc, toDoc, type DocNode } from "./domain/doc";
import type { Note } from "./domain/types";
import { EditorToolbar } from "./EditorToolbar";
import { noteExtensions } from "./editorExtensions";
import { copyAttachment, saveImageAttachment } from "./service";
import { useNotesStore } from "./store";

/** What the screen can ask the open text note to do (files dropped onto the window). */
export interface NoteEditorApi {
  insertImageFiles: (paths: readonly string[]) => Promise<void>;
}

interface TextNoteEditorProps {
  note: Note;
  libraryRoot: string;
  preferredSystem: string | null;
  apiRef: RefObject<NoteEditorApi | null>;
  onError: (message: string) => void;
}

const SAVE_DELAY_MS = 600;

type SaveState = "saved" | "pending" | "error";

/** Rich text of a note, saved automatically. Mounted once per note (keyed by its id). */
export function TextNoteEditor({
  note,
  libraryRoot,
  preferredSystem,
  apiRef,
  onError,
}: TextNoteEditorProps) {
  const saveContent = useNotesStore((s) => s.saveContent);
  const [picking, setPicking] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const pending = useRef<DocNode | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const { id: noteId, campaignId } = note;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const doc = pending.current;
    if (!doc) return;
    pending.current = null;
    saveContent(noteId, serializeDoc(doc), docPlainText(doc, mentionName))
      .then(() => {
        if (!pending.current) setSaveState("saved");
      })
      .catch((e: unknown) => {
        console.error(e);
        setSaveState("error");
        onError(ru.notes.saveFailed);
      });
  }, [noteId, saveContent, onError]);

  const insertImages = useCallback(
    async (sources: () => Promise<{ src: string; alt?: string }[]>) => {
      try {
        const images = await sources();
        const editor = editorRef.current;
        if (!editor || editor.isDestroyed) return;
        let chain = editor.chain().focus();
        for (const image of images) chain = chain.setImage(image);
        chain.run();
      } catch (e) {
        console.error(e);
        onError(ru.notes.editor.imageFailed);
      }
    },
    [onError],
  );

  const pasteFiles = useCallback(
    (files: File[]) =>
      void insertImages(() =>
        Promise.all(
          files.map(async (file) => ({
            src: await saveImageAttachment(libraryRoot, campaignId, file),
          })),
        ),
      ),
    [insertImages, libraryRoot, campaignId],
  );
  // The editor keeps the handlers it was created with.
  const pasteRef = useRef(pasteFiles);
  useEffect(() => {
    pasteRef.current = pasteFiles;
  }, [pasteFiles]);

  const extensions = useMemo(() => noteExtensions(libraryRoot), [libraryRoot]);
  const editor = useEditor({
    extensions,
    content: parseDoc(note.content) as JSONContent,
    onUpdate: ({ editor: e }) => {
      pending.current = toDoc(e.getJSON());
      setSaveState("pending");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0) return false;
        pasteRef.current(files);
        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // The latest `flush` is needed when the note closes, not the one of the first render.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => flushRef.current(), []);

  useEffect(() => {
    apiRef.current = {
      insertImageFiles: (paths) =>
        insertImages(() =>
          Promise.all(
            paths.map(async (path) => ({
              src: await copyAttachment(libraryRoot, campaignId, path),
            })),
          ),
        ),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, insertImages, libraryRoot, campaignId]);

  async function imageFromFile() {
    const paths = await pickFiles(ru.notes.editor.imageFile, [
      { name: ru.notes.editor.imageFilter, extensions: [...IMAGE_EXTENSIONS] },
    ]);
    if (paths.length > 0) await apiRef.current?.insertImageFiles(paths);
  }

  const status =
    saveState === "pending"
      ? ru.notes.editor.saving
      : saveState === "error"
        ? ru.notes.saveFailed
        : ru.notes.editor.saved;

  return (
    <div className="note-editor">
      <EditorToolbar
        editor={editor}
        onImageFile={() => void imageFromFile()}
        onImageArt={() => setPicking(true)}
        status={status}
      />
      <div
        className="note-editor-scroll"
        onMouseDown={(e) => {
          // A click below the text puts the cursor at its end.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} className="note-editor-content" />
        <div className="note-mentioned">
          <MentionedIn kind="note" id={noteId} />
        </div>
      </div>
      {picking && (
        <ArtPicker
          libraryRoot={libraryRoot}
          preferredSystem={preferredSystem}
          withTokens
          onPick={(art, token) => {
            setPicking(false);
            void insertImages(async () => [
              { src: token?.relPath ?? art.relPath, alt: artName(art) },
            ]);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
