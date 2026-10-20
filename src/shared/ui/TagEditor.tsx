import { useState, type KeyboardEvent } from "react";
import { ru } from "../i18n/ru";

interface TagEditorProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** Tag chips with an input: Enter or comma adds, Backspace in an empty input removes the last. */
export function TagEditor({ label, tags, onChange }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim();
    setDraft("");
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="tag-editor">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button
              type="button"
              aria-label={ru.common.removeTag(tag)}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={ru.common.addTag}
        />
      </div>
    </div>
  );
}
