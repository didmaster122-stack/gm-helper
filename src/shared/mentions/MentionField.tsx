import { useEffect, useId, useRef } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { ru } from "../i18n/ru";
import { MentionNode } from "./extension";
import { fieldDocToText, textToFieldDoc, type FieldNode } from "./field";

interface MentionFieldProps {
  label: string;
  /** Text with mention tokens (see `formatMention`). */
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  /** Puts the cursor at the end of the text when the field appears. */
  autoFocus?: boolean;
}

// Only lines of text and mentions: no formatting.
const extensions = (placeholder: string) => [
  StarterKit.configure({
    blockquote: false,
    bold: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    hardBreak: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    listKeymap: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    underline: false,
  }),
  Placeholder.configure({ placeholder }),
  MentionNode,
];

/**
 * Multi-line field where `@` mentions an object of the campaign. Like `CommitField`, it saves
 * when it loses focus and follows outside changes of `value` while it is not being edited.
 */
export function MentionField({
  label,
  value,
  onCommit,
  placeholder = ru.mentions.hint,
  autoFocus = false,
}: MentionFieldProps) {
  const labelId = useId();
  const valueRef = useRef(value);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const editor = useEditor({
    extensions: extensions(placeholder),
    content: textToFieldDoc(value) as JSONContent,
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { class: "mention-input", "aria-labelledby": labelId } },
    onBlur: ({ editor: e }) => {
      const text = fieldDocToText(e.getJSON() as FieldNode);
      if (text !== valueRef.current) commitRef.current(text);
    },
  });

  useEffect(() => {
    valueRef.current = value;
    if (editor.isFocused) return;
    if (fieldDocToText(editor.getJSON() as FieldNode) === value) return;
    editor.commands.setContent(textToFieldDoc(value) as JSONContent, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="field mention-field">
      <span id={labelId}>{label}</span>
      <EditorContent editor={editor} />
    </div>
  );
}
