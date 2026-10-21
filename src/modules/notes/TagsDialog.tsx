import { useState } from "react";
import { Pencil, Trash } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, IconButton, Modal, PromptDialog } from "../../shared/ui";
import { findTag, sortTags } from "./domain/filter";
import type { Note, NoteTag } from "./domain/types";
import { useNotesStore } from "./store";

interface TagsDialogProps {
  tags: readonly NoteTag[];
  notes: readonly Note[];
  onClose: () => void;
}

/** Renaming and deleting the campaign's note tags. */
export function TagsDialog({ tags, notes, onClose }: TagsDialogProps) {
  const t = ru.notes.tags;
  const renameTag = useNotesStore((s) => s.renameTag);
  const deleteTag = useNotesStore((s) => s.deleteTag);
  const [renaming, setRenaming] = useState<NoteTag | null>(null);
  const [deleting, setDeleting] = useState<NoteTag | null>(null);

  const count = (id: string) => notes.filter((n) => n.tagIds.includes(id)).length;

  return (
    <>
      <Modal title={t.manageTitle} onClose={onClose}>
        {tags.length === 0 ? (
          <p className="muted">{t.manageEmpty}</p>
        ) : (
          <ul className="row-list tag-manage-list">
            {sortTags(tags).map((tag) => (
              <li key={tag.id}>
                <span className="tag">{tag.name}</span>
                <span className="muted">{t.count(count(tag.id))}</span>
                <span className="spacer" />
                <IconButton
                  size="sm"
                  icon={Pencil}
                  label={t.rename}
                  onClick={() => setRenaming(tag)}
                />
                <IconButton
                  size="sm"
                  icon={Trash}
                  label={ru.common.delete}
                  className="danger"
                  onClick={() => setDeleting(tag)}
                />
              </li>
            ))}
          </ul>
        )}
      </Modal>
      {renaming && (
        <PromptDialog
          title={t.renameTitle}
          label={t.nameLabel}
          initialValue={renaming.name}
          confirmLabel={ru.common.save}
          validate={(value) => {
            if (value.trim() === "") return t.nameEmpty;
            const other = findTag(tags, value);
            return other && other.id !== renaming.id ? t.nameTaken : null;
          }}
          onSubmit={(value) => renameTag(renaming.id, value)}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(deleting.name)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => deleteTag(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
