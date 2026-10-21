import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Check, CircleAlert, Copy, FileText, Trash, X } from "lucide-react";
import { toAbsolute } from "../../shared/catalog/paths";
import { pickFiles, pickSavePath } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { useRememberOpened } from "../../shared/recent";
import { Button, ConfirmDialog, EmptyState, IconButton, PromptDialog } from "../../shared/ui";
import type { Campaign } from "../campaigns";
import { archiveFileName } from "./domain/archive";
import { isImageFile, isPdfFile, PDF_EXTENSION } from "./domain/attachments";
import { NOTE_TITLE_MAX, type Note } from "./domain/types";
import { NoteList } from "./NoteList";
import { PdfViewer } from "./PdfViewer";
import { writeArchive } from "./service";
import { useNotesStore } from "./store";
import { TagPicker } from "./TagPicker";
import { TagsDialog } from "./TagsDialog";
import { TextNoteEditor, type NoteEditorApi } from "./TextNoteEditor";

interface NotesScreenProps {
  campaign: Campaign;
  libraryRoot: string;
}

type Message = { tone: "info" | "error"; text: string };

export function NotesScreen({ campaign, libraryRoot }: NotesScreenProps) {
  const t = ru.notes;
  const load = useNotesStore((s) => s.load);
  const status = useNotesStore((s) => s.status);
  const loadedFor = useNotesStore((s) => s.campaignId);
  const notes = useNotesStore((s) => s.notes);
  const tags = useNotesStore((s) => s.tags);
  const openId = useNotesStore((s) => s.openId);
  useRememberOpened(campaign.id, "note", loadedFor === campaign.id ? openId : null);
  const checked = useNotesStore((s) => s.checked);
  const createText = useNotesStore((s) => s.createText);
  const addPdfs = useNotesStore((s) => s.addPdfs);
  const [message, setMessage] = useState<Message | null>(null);
  const [dragging, setDragging] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const editorApi = useRef<NoteEditorApi | null>(null);

  useEffect(() => {
    void load(campaign.id, libraryRoot);
  }, [load, campaign.id, libraryRoot]);

  const showError = useCallback((text: string) => setMessage({ tone: "error", text }), []);

  const importPdfs = useCallback(
    async (paths: readonly string[]) => {
      if (paths.length === 0) return;
      try {
        const count = await addPdfs(libraryRoot, paths);
        setMessage({ tone: "info", text: t.added(count) });
      } catch (e) {
        console.error(e);
        showError(t.addFailed);
      }
    },
    [addPdfs, libraryRoot, showError, t],
  );

  // Files dropped onto the window: PDFs become notes, images go into the open text note.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") {
          setDragging(true);
          return;
        }
        setDragging(false);
        if (payload.type !== "drop" || payload.paths.length === 0) return;
        if (document.querySelector(".modal-backdrop")) return;
        const pdfs = payload.paths.filter(isPdfFile);
        const images = payload.paths.filter(isImageFile);
        if (pdfs.length === 0 && images.length === 0) {
          showError(t.dropUnsupported);
          return;
        }
        void importPdfs(pdfs);
        if (images.length > 0) {
          if (editorApi.current) void editorApi.current.insertImageFiles(images);
          else showError(t.dropNeedText);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [importPdfs, showError, t]);

  async function pickPdfs() {
    const paths = await pickFiles(t.pdfDialogTitle, [
      { name: t.pdfFilter, extensions: [PDF_EXTENSION] },
    ]);
    await importPdfs(paths);
  }

  async function saveArchive(name: string) {
    const target = await pickSavePath(t.archive.saveTitle, archiveFileName(name), [
      { name: t.archive.filter, extensions: ["zip"] },
    ]);
    if (!target) return;
    const chosen = notes.filter((n) => checked.has(n.id));
    try {
      const report = await writeArchive(libraryRoot, name, chosen, tags, target);
      setMessage(
        report.missing.length > 0
          ? {
              tone: "error",
              text: `${t.archive.done(report.notes)}. ${t.archive.missing(report.missing.join(", "))}`,
            }
          : { tone: "info", text: t.archive.done(report.notes) },
      );
    } catch (e) {
      console.error(e);
      showError(t.archive.failed);
    }
  }

  if (status === "error") {
    return (
      <EmptyState
        icon={CircleAlert}
        tone="error"
        title={t.loadFailed}
        action={
          <Button onClick={() => void load(campaign.id, libraryRoot, true)}>
            {ru.common.retry}
          </Button>
        }
      />
    );
  }
  if (status !== "ready" || loadedFor !== campaign.id) {
    return (
      <div className="center">
        <div className="spinner" role="status" aria-label={ru.common.loading} />
      </div>
    );
  }

  const openNote = notes.find((n) => n.id === openId) ?? null;

  return (
    <div className={dragging ? "notes dragging" : "notes"}>
      <NoteList
        onCreate={() => void createText()}
        onAddPdf={() => void pickPdfs()}
        onManageTags={() => setManagingTags(true)}
        onArchive={() => setArchiving(true)}
      />
      <section className="notes-main">
        {message && (
          <div className={message.tone === "error" ? "notice error" : "notice"}>
            {message.tone === "error" ? <CircleAlert aria-hidden /> : <Check aria-hidden />}
            <span>{message.text}</span>
            <IconButton
              size="sm"
              icon={X}
              label={ru.common.close}
              onClick={() => setMessage(null)}
            />
          </div>
        )}
        {openNote ? (
          <NoteView
            key={openNote.id}
            note={openNote}
            libraryRoot={libraryRoot}
            preferredSystem={campaign.system}
            editorApi={editorApi}
            onError={showError}
          />
        ) : (
          <EmptyState icon={FileText} title={t.noOpenTitle} text={t.noOpenText} />
        )}
        {dragging && <div className="notes-drop">{t.drop}</div>}
      </section>
      {managingTags && (
        <TagsDialog tags={tags} notes={notes} onClose={() => setManagingTags(false)} />
      )}
      {archiving && (
        <PromptDialog
          title={t.archive.title}
          label={t.archive.nameLabel}
          confirmLabel={t.archive.confirm}
          validate={(value) => (value.trim() === "" ? t.archive.nameEmpty : null)}
          onSubmit={saveArchive}
          onClose={() => setArchiving(false)}
        />
      )}
    </div>
  );
}

interface NoteViewProps {
  note: Note;
  libraryRoot: string;
  preferredSystem: string | null;
  editorApi: React.RefObject<NoteEditorApi | null>;
  onError: (message: string) => void;
}

function NoteView({ note, libraryRoot, preferredSystem, editorApi, onError }: NoteViewProps) {
  const t = ru.notes;
  const tags = useNotesStore((s) => s.tags);
  const rename = useNotesStore((s) => s.rename);
  const duplicate = useNotesStore((s) => s.duplicate);
  const remove = useNotesStore((s) => s.remove);
  const setNoteTags = useNotesStore((s) => s.setNoteTags);
  const ensureTag = useNotesStore((s) => s.ensureTag);
  const [title, setTitle] = useState(note.title);
  const [deleting, setDeleting] = useState(false);
  const fail = (e: unknown) => {
    console.error(e);
    onError(t.saveFailed);
  };

  function commitTitle() {
    const value = title.trim();
    if (value === "" || value === note.title) setTitle(note.title);
    else rename(note.id, value).catch(fail);
  }

  return (
    <div className="note-view">
      <header className="note-header">
        <input
          className="note-title"
          aria-label={t.titleLabel}
          value={title}
          maxLength={NOTE_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTitle(note.title);
              e.currentTarget.blur();
            }
          }}
          autoFocus={note.kind === "text" && note.plainText === "" && note.title === t.untitled}
          onFocus={(e) => e.target.select()}
        />
        <IconButton
          icon={Copy}
          label={t.duplicate}
          onClick={() => duplicate(note.id).catch(fail)}
        />
        <IconButton
          icon={Trash}
          label={ru.common.delete}
          className="danger"
          onClick={() => setDeleting(true)}
        />
      </header>
      <TagPicker
        tags={tags}
        selected={note.tagIds}
        onChange={(ids) => setNoteTags(note.id, ids).catch(fail)}
        onCreate={ensureTag}
      />
      {note.kind === "pdf" ? (
        note.filePath ? (
          <PdfViewer path={toAbsolute(libraryRoot, note.filePath)} />
        ) : null
      ) : (
        <TextNoteEditor
          note={note}
          libraryRoot={libraryRoot}
          preferredSystem={preferredSystem}
          apiRef={editorApi}
          onError={onError}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(note.title)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(libraryRoot, note.id)}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
