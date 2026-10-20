import { useState, type FormEvent } from "react";
import { ru } from "../i18n/ru";
import { Modal } from "./Modal";

interface PromptDialogProps {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}

export function PromptDialog({
  title,
  label,
  initialValue = "",
  confirmLabel,
  validate,
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const error = validate?.(value) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setFailure(String(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="submit" form="prompt-form" className="primary" disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <form id="prompt-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>{label}</span>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setTouched(true);
            }}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          {touched && error && <small className="error">{error}</small>}
        </label>
        {failure && <p className="error">{failure}</p>}
      </form>
    </Modal>
  );
}
