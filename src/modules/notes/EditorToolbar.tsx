import { useEditorState, type Editor } from "@tiptap/react";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Images,
  Italic,
  List,
  ListOrdered,
  Minus,
  PanelTop,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { IconButton, Segmented } from "../../shared/ui";

interface EditorToolbarProps {
  editor: Editor;
  onImageFile: () => void;
  onImageArt: () => void;
  status: string | null;
}

const HEADING_LEVELS = [1, 2, 3] as const;

export function EditorToolbar({ editor, onImageFile, onImageArt, status }: EditorToolbarProps) {
  const t = ru.notes.editor;
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: HEADING_LEVELS.find((level) => e.isActive("heading", { level })) ?? 0,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="toolbar note-editor-toolbar">
      <div className="toolbar-group">
        <IconButton
          icon={Undo2}
          label={t.undo}
          shortcut="Ctrl+Z"
          disabled={!state.canUndo}
          onClick={() => chain().undo().run()}
        />
        <IconButton
          icon={Redo2}
          label={t.redo}
          shortcut="Ctrl+Y"
          disabled={!state.canRedo}
          onClick={() => chain().redo().run()}
        />
      </div>
      <span className="toolbar-sep" />
      <Segmented<number>
        size="sm"
        value={state.heading}
        onChange={(level) => {
          if (level === 0) chain().setParagraph().run();
          else
            chain()
              .setHeading({ level: level as 1 | 2 | 3 })
              .run();
        }}
        options={[
          { value: 0, label: t.paragraph, icon: Pilcrow, iconOnly: true },
          { value: 1, label: t.heading(1), icon: Heading1, iconOnly: true },
          { value: 2, label: t.heading(2), icon: Heading2, iconOnly: true },
          { value: 3, label: t.heading(3), icon: Heading3, iconOnly: true },
        ]}
      />
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton
          icon={Bold}
          label={t.bold}
          shortcut="Ctrl+B"
          active={state.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <IconButton
          icon={Italic}
          label={t.italic}
          shortcut="Ctrl+I"
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <IconButton
          icon={Underline}
          label={t.underline}
          shortcut="Ctrl+U"
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        />
        <IconButton
          icon={Strikethrough}
          label={t.strike}
          shortcut="Ctrl+Shift+S"
          active={state.strike}
          onClick={() => chain().toggleStrike().run()}
        />
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton
          icon={List}
          label={t.bulletList}
          active={state.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        />
        <IconButton
          icon={ListOrdered}
          label={t.orderedList}
          active={state.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <IconButton
          icon={Quote}
          label={t.quote}
          active={state.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        />
        <IconButton icon={Minus} label={t.rule} onClick={() => chain().setHorizontalRule().run()} />
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton icon={ImagePlus} label={t.imageFile} onClick={onImageFile} />
        <IconButton icon={Images} label={t.imageArt} onClick={onImageArt} />
        <IconButton
          icon={Table}
          label={t.table}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
      </div>
      {state.table && (
        <>
          <span className="toolbar-sep" />
          <div className="toolbar-group">
            <IconButton
              icon={BetweenHorizontalEnd}
              label={t.addRowAfter}
              onClick={() => chain().addRowAfter().run()}
            />
            <IconButton
              icon={BetweenVerticalEnd}
              label={t.addColumnAfter}
              onClick={() => chain().addColumnAfter().run()}
            />
            <IconButton
              icon={Rows3}
              label={t.deleteRow}
              onClick={() => chain().deleteRow().run()}
            />
            <IconButton
              icon={Columns3}
              label={t.deleteColumn}
              onClick={() => chain().deleteColumn().run()}
            />
            <IconButton
              icon={PanelTop}
              label={t.headerRow}
              onClick={() => chain().toggleHeaderRow().run()}
            />
            <IconButton
              icon={Trash2}
              label={t.deleteTable}
              className="danger"
              onClick={() => chain().deleteTable().run()}
            />
          </div>
        </>
      )}
      <span className="spacer" />
      {status && <span className="muted note-save-status">{status}</span>}
    </div>
  );
}
