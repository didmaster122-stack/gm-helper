import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import type { ImportItem } from "./domain/importPlan";

interface ImportDialogProps {
  items: ImportItem[];
  onRun: (renameConflicts: boolean) => Promise<void>;
  onClose: () => void;
}

/** Shown only when some dropped files conflict with existing names. */
export function ImportDialog({ items, onRun, onClose }: ImportDialogProps) {
  const [busy, setBusy] = useState(false);
  const conflicts = items.filter((i) => i.conflict);
  const unsupported = items.filter((i) => i.unsupported).length;

  async function run(rename: boolean) {
    setBusy(true);
    try {
      await onRun(rename);
    } finally {
      onClose();
    }
  }

  return (
    <Modal
      title={ru.library.import.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="button" onClick={() => void run(false)} disabled={busy}>
            {ru.library.import.skipConflicts}
          </button>
          <button type="button" className="primary" onClick={() => void run(true)} disabled={busy}>
            {ru.library.import.renameAll}
          </button>
        </>
      }
    >
      <p>{ru.library.import.conflicts(conflicts.length)}</p>
      <ul className="import-list">
        {conflicts.slice(0, 12).map((i) => (
          <li key={i.source}>
            {i.fileName} → <strong>{i.targetName}</strong>
          </li>
        ))}
        {conflicts.length > 12 && <li>{ru.library.andMore(conflicts.length - 12)}</li>}
      </ul>
      {unsupported > 0 && <p className="muted">{ru.library.import.unsupported(unsupported)}</p>}
    </Modal>
  );
}
