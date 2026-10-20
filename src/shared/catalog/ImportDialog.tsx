import { useState } from "react";
import { ru } from "../i18n/ru";
import { Button, Modal } from "../ui";
import type { ImportItem } from "./importPlan";

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
      title={ru.catalog.import.title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </Button>
          <Button onClick={() => void run(false)} disabled={busy}>
            {ru.catalog.import.skipConflicts}
          </Button>
          <Button variant="primary" onClick={() => void run(true)} disabled={busy}>
            {ru.catalog.import.renameAll}
          </Button>
        </>
      }
    >
      <p>{ru.catalog.import.conflicts(conflicts.length)}</p>
      <ul className="import-list">
        {conflicts.slice(0, 12).map((i) => (
          <li key={i.source}>
            {i.fileName} → <strong>{i.targetName}</strong>
          </li>
        ))}
        {conflicts.length > 12 && <li>{ru.catalog.andMore(conflicts.length - 12)}</li>}
      </ul>
      {unsupported > 0 && <p className="muted">{ru.catalog.import.unsupported(unsupported)}</p>}
    </Modal>
  );
}
