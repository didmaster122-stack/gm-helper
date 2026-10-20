import { useState } from "react";
import { ru } from "../i18n/ru";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
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
          <button
            type="button"
            className={danger ? "destructive" : "primary"}
            onClick={confirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}
