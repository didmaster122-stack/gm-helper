import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { IconButton } from "../../shared/ui";
import { addItem, moveItem, removeItem, renameItem, toggleItem } from "./domain/sessions";
import { PREP_ITEM_MAX, type PrepItem } from "./domain/types";

interface PrepListProps {
  items: readonly PrepItem[];
  onChange: (edit: (items: readonly PrepItem[]) => PrepItem[]) => void;
}

const newId = () => crypto.randomUUID();

/** The preparation checklist: tick, rename in place, reorder, remove, add. */
export function PrepList({ items, onChange }: PrepListProps) {
  const t = ru.sessions.prep;
  const [draft, setDraft] = useState("");

  return (
    <div className="prep">
      {items.length === 0 && <p className="muted prep-empty">{t.empty}</p>}
      <ul className="prep-list">
        {items.map((item, i) => (
          <li key={item.id} className={item.done ? "done" : undefined}>
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text}
              onChange={() => onChange((list) => toggleItem(list, item.id))}
            />
            <ItemText
              value={item.text}
              onCommit={(text) => onChange((list) => renameItem(list, item.id, text))}
            />
            <span className="prep-tools">
              <IconButton
                icon={ArrowUp}
                size="sm"
                label={t.up}
                disabled={i === 0}
                onClick={() => onChange((list) => moveItem(list, item.id, -1))}
              />
              <IconButton
                icon={ArrowDown}
                size="sm"
                label={t.down}
                disabled={i === items.length - 1}
                onClick={() => onChange((list) => moveItem(list, item.id, 1))}
              />
              <IconButton
                icon={X}
                size="sm"
                className="danger"
                label={t.remove}
                onClick={() => onChange((list) => removeItem(list, item.id))}
              />
            </span>
          </li>
        ))}
      </ul>
      <form
        className="prep-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() === "") return;
          onChange((list) => addItem(list, draft, newId));
          setDraft("");
        }}
      >
        <Plus aria-hidden />
        <input
          value={draft}
          placeholder={t.add}
          aria-label={t.add}
          maxLength={PREP_ITEM_MAX}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </div>
  );
}

/** Item text edited in place: saved on blur or Enter, Escape returns the saved text. */
function ItemText({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <input
      className="prep-text"
      value={draft}
      aria-label={ru.sessions.prep.item}
      maxLength={PREP_ITEM_MAX}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() === "") setDraft(value);
        else if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Only the edit is cancelled, not the dialog around it.
          e.stopPropagation();
          setDraft(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
