import { useRef, useState } from "react";

interface CommitFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  /** An empty value is not saved: the field returns to the saved one. */
  required?: boolean;
}

/**
 * Labelled text field that saves when it loses focus (or on Enter for one line).
 * It follows outside changes of `value` (e.g. undo) while it is not being edited.
 */
export function CommitField({
  label,
  value,
  onCommit,
  multiline = false,
  placeholder,
  className,
  required = false,
}: CommitFieldProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);
  const cancelled = useRef(false);
  if (value !== seen && !editing) {
    setSeen(value);
    setDraft(value);
  }

  const common = {
    value: draft,
    placeholder,
    onFocus: () => setEditing(true),
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      setEditing(false);
      setSeen(value);
      if (cancelled.current || (required && draft.trim() === "")) {
        cancelled.current = false;
        setDraft(value);
      } else if (draft !== value) {
        onCommit(draft);
      }
    },
  };

  return (
    <label className={className ? `field ${className}` : "field"}>
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} {...common} />
      ) : (
        <input
          {...common}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </label>
  );
}
