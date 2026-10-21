import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, Tag, X } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, useDismiss } from "../../shared/ui";
import { findTag, matchTags } from "./domain/filter";
import type { NoteTag } from "./domain/types";

interface TagPickerProps {
  tags: readonly NoteTag[];
  selected: readonly string[];
  onChange: (tagIds: string[]) => void;
  /** Creates a tag of the campaign (or returns the existing one with that name). */
  onCreate: (name: string) => Promise<NoteTag>;
}

type Option = { kind: "tag"; tag: NoteTag } | { kind: "create"; name: string };

/** Tags of a note: chips plus a drop-down list of the campaign's tags with search and create. */
export function TagPicker({ tags, selected, onChange, onCreate }: TagPickerProps) {
  const t = ru.notes.tags;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setTyped("");
  }, []);
  useDismiss(ref, open, close);

  const byId = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const chosen = selected
    .map((id) => byId.get(id))
    .filter((tag): tag is NoteTag => tag !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const options = useMemo<Option[]>(() => {
    const list: Option[] = matchTags(tags, typed).map((tag) => ({ kind: "tag", tag }));
    const name = typed.trim();
    if (name !== "" && !findTag(tags, name)) list.push({ kind: "create", name });
    return list;
  }, [tags, typed]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  async function choose(option: Option | undefined) {
    if (!option) return;
    if (option.kind === "tag") {
      toggle(option.tag.id);
    } else {
      const tag = await onCreate(option.name);
      if (!selected.includes(tag.id)) onChange([...selected, tag.id]);
    }
    setTyped("");
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (options.length === 0 ? 0 : (i + step + options.length) % options.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(options[Math.min(active, options.length - 1)]);
    }
  }

  return (
    <div className="note-tags" ref={ref}>
      {chosen.map((tag) => (
        <span key={tag.id} className="tag">
          {tag.name}
          <button
            type="button"
            aria-label={ru.common.removeTag(tag.name)}
            onClick={() => toggle(tag.id)}
          >
            <X aria-hidden />
          </button>
        </span>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => setOpen((o) => !o)}>
        {chosen.length === 0 ? t.add : null}
      </Button>
      {open && (
        <div className="popover tag-picker">
          <input
            autoFocus
            value={typed}
            placeholder={t.search}
            aria-label={t.search}
            onChange={(e) => {
              setTyped(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="menu-list">
            {options.length === 0 && <li className="muted">{t.none}</li>}
            {options.map((option, i) => (
              <li key={option.kind === "tag" ? option.tag.id : "create"}>
                <button
                  type="button"
                  className={i === active ? "current" : ""}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void choose(option)}
                >
                  {option.kind === "tag" ? (
                    <>
                      <Check
                        aria-hidden
                        className={selected.includes(option.tag.id) ? "tag-check" : "tag-check off"}
                      />
                      {option.tag.name}
                    </>
                  ) : (
                    <>
                      <Tag aria-hidden className="tag-check" />
                      {t.create(option.name)}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
