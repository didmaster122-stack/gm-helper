import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  FileText,
  FileType,
  Funnel,
  ListChecks,
  SearchX,
  Tags,
  X,
} from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, EmptyState, IconButton, MenuSelect, useDismiss } from "../../shared/ui";
import { filterNotes, notesWithTag, sortTags, type NoteSort } from "./domain/filter";
import type { Note } from "./domain/types";
import { useNotesStore } from "./store";

interface NoteListProps {
  onArchive: () => void;
}

/** A button with a popover under it that closes on an outside click or Escape. */
function Dropdown({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: typeof Funnel;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className="notes-dropdown" ref={ref}>
      <Button size="sm" icon={icon} active={active} onClick={() => setOpen((o) => !o)}>
        {label}
        <ChevronDown aria-hidden />
      </Button>
      {open && children(close)}
    </div>
  );
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ru");

/** Tag filter, tag management and sort order: the tools row under the screen header. */
export function NoteFilters({ onManageTags }: { onManageTags: () => void }) {
  const t = ru.notes;
  const tags = useNotesStore((s) => s.tags);
  const filter = useNotesStore((s) => s.filter);
  const setFilter = useNotesStore((s) => s.setFilter);
  const sort = useNotesStore((s) => s.sort);
  const setSort = useNotesStore((s) => s.setSort);
  const sortedTags = useMemo(() => sortTags(tags), [tags]);
  const tagFilterOn = filter.untagged || filter.tagIds.length > 0;

  const toggleFilterTag = (id: string) =>
    setFilter({
      untagged: false,
      tagIds: filter.tagIds.includes(id)
        ? filter.tagIds.filter((x) => x !== id)
        : [...filter.tagIds, id],
    });

  return (
    <div className="notes-filters">
      <Dropdown label={t.filter.button} icon={Funnel} active={tagFilterOn}>
        {() => (
          <div className="popover filter-menu">
            <h4>{t.filter.title}</h4>
            {sortedTags.length === 0 && <p className="muted">{t.filter.noTags}</p>}
            {sortedTags.map((tag) => (
              <label key={tag.id} className="check">
                <input
                  type="checkbox"
                  checked={!filter.untagged && filter.tagIds.includes(tag.id)}
                  onChange={() => toggleFilterTag(tag.id)}
                />
                <span>{tag.name}</span>
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={filter.untagged}
                onChange={(e) => setFilter({ untagged: e.target.checked, tagIds: [] })}
              />
              <span>{t.filter.untagged}</span>
            </label>
            {tagFilterOn && (
              <Button size="sm" onClick={() => setFilter({ untagged: false, tagIds: [] })}>
                {t.filter.clear}
              </Button>
            )}
          </div>
        )}
      </Dropdown>
      <IconButton size="sm" icon={Tags} label={t.tags.manage} onClick={onManageTags} />
      <span className="spacer" />
      <MenuSelect<NoteSort>
        label={t.sort.label}
        buttonLabel={t.sort.button(t.sort[sort])}
        value={sort}
        onChange={setSort}
        options={[
          { value: "updated", label: t.sort.updated },
          { value: "title", label: t.sort.title },
        ]}
      />
    </div>
  );
}

export function NoteList({ onArchive }: NoteListProps) {
  const t = ru.notes;
  const notes = useNotesStore((s) => s.notes);
  const tags = useNotesStore((s) => s.tags);
  const openId = useNotesStore((s) => s.openId);
  const open = useNotesStore((s) => s.open);
  const checked = useNotesStore((s) => s.checked);
  const toggleChecked = useNotesStore((s) => s.toggleChecked);
  const check = useNotesStore((s) => s.check);
  const clearChecked = useNotesStore((s) => s.clearChecked);
  const filter = useNotesStore((s) => s.filter);
  const sort = useNotesStore((s) => s.sort);

  const shown = useMemo(() => filterNotes(notes, filter, sort), [notes, filter, sort]);
  const sortedTags = useMemo(() => sortTags(tags), [tags]);
  const tagNames = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags]);

  const row = (note: Note) => {
    const Icon = note.kind === "pdf" ? FileType : FileText;
    const names = note.tagIds
      .map((id) => tagNames.get(id))
      .filter((n): n is string => n !== undefined)
      .sort((a, b) => a.localeCompare(b, "ru"));
    return (
      <li key={note.id} className={note.id === openId ? "note-row active" : "note-row"}>
        <input
          type="checkbox"
          checked={checked.has(note.id)}
          onChange={() => toggleChecked(note.id)}
          title={t.selection.check}
          aria-label={t.selection.check}
        />
        <button type="button" className="note-row-open" onClick={() => open(note.id)}>
          <span className="note-row-title">
            <Icon aria-hidden />
            <span>{note.title}</span>
          </span>
          <span className="note-row-meta">
            {names.length === 0 ? (
              <span className="muted">{t.untaggedBadge}</span>
            ) : (
              names.map((name) => (
                <span key={name} className="tag">
                  {name}
                </span>
              ))
            )}
            <span className="spacer" />
            <span className="muted note-row-date">{formatDate(note.updatedAt)}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside className="notes-sidebar">
      {notes.length === 0 ? (
        <EmptyState compact icon={FileText} title={t.emptyTitle} text={t.emptyText} />
      ) : shown.length === 0 ? (
        <EmptyState compact icon={SearchX} title={t.noResults} />
      ) : (
        <ul className="note-list">{shown.map(row)}</ul>
      )}

      <div className="notes-selection">
        <Dropdown label={t.selection.byTag} icon={ListChecks}>
          {(close) => (
            <ul className="popover menu-list notes-by-tag" title={t.selection.byTagHint}>
              {sortedTags.length === 0 && <li className="muted">{t.filter.noTags}</li>}
              {sortedTags.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => {
                      check(notesWithTag(notes, tag.id));
                      close();
                    }}
                  >
                    {tag.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dropdown>
        {checked.size > 0 && (
          <span className="notes-checked">
            {t.selection.checked(checked.size)}
            <IconButton size="sm" icon={X} label={t.selection.clear} onClick={clearChecked} />
          </span>
        )}
        <span className="spacer" />
        <Button size="sm" disabled={checked.size === 0} onClick={onArchive}>
          {t.archive.button}
        </Button>
      </div>
    </aside>
  );
}
