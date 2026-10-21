import { useEffect, useState } from "react";
import { FolderOpen, History } from "lucide-react";
import { formatMoment } from "../../shared/dates";
import { backupsDir, listDbBackups, restoreDbBackup, type DbBackup } from "../../shared/db";
import { revealInExplorer } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { revealErrorLog } from "../../shared/log";
import { Button, ConfirmDialog, Modal } from "../../shared/ui";

const t = ru.dbBackups;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return t.sizeKb(Math.max(1, Math.round(bytes / 1024)));
  return t.sizeMb((bytes / 1024 / 1024).toFixed(1));
}

function RestoreDialog({ backups, onClose }: { backups: DbBackup[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<DbBackup | null>(backups[0] ?? null);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = new Date();

  async function restore() {
    if (!chosen) return;
    try {
      await restoreDbBackup(chosen.path);
    } catch (e) {
      console.error(e);
      setFailed(true);
      return;
    }
    window.location.reload();
  }

  if (confirming && chosen) {
    return (
      <ConfirmDialog
        title={t.confirmTitle}
        text={t.confirmText(formatMoment(chosen.createdAt, now))}
        confirmLabel={t.restore}
        danger
        onConfirm={restore}
        onClose={() => setConfirming(false)}
      />
    );
  }

  return (
    <Modal
      title={t.restoreTitle}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{ru.common.cancel}</Button>
          <Button variant="primary" disabled={!chosen} onClick={() => setConfirming(true)}>
            {t.restore}
          </Button>
        </>
      }
    >
      {failed && <p className="error">{t.restoreFailed}</p>}
      {backups.length === 0 ? (
        <p className="hint">{t.none}</p>
      ) : (
        <ul className="db-backup-list" role="radiogroup" aria-label={t.restoreTitle}>
          {backups.map((b) => (
            <li key={b.path}>
              <label>
                <input
                  type="radio"
                  name="db-backup"
                  checked={chosen?.path === b.path}
                  onChange={() => setChosen(b)}
                />
                <span>{formatMoment(b.createdAt, now)}</span>
                {b.kind === "before-restore" && <span className="hint">{t.beforeRestore}</span>}
                <span className="hint db-backup-size">{formatSize(b.size)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Daily copies of the database: when the last one was made, open the folder, restore. */
export function DbBackupSettings() {
  const [backups, setBackups] = useState<DbBackup[] | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    listDbBackups()
      .then(setBackups)
      .catch((e: unknown) => console.error(e));
  }, []);

  const lastAuto = backups?.find((b) => b.kind === "auto");

  return (
    <div className="db-backups">
      <p>{lastAuto ? t.last(formatMoment(lastAuto.createdAt, new Date())) : t.lastNone}</p>
      <div className="path-row">
        <Button
          icon={FolderOpen}
          onClick={() => {
            // Selecting the newest copy opens the folder itself, not its parent.
            const target = backups?.[0]?.path;
            void (target ? revealInExplorer(target) : backupsDir().then(revealInExplorer));
          }}
        >
          {t.openFolder}
        </Button>
        <Button icon={History} disabled={!backups} onClick={() => setRestoring(true)}>
          {t.restoreOpen}
        </Button>
      </div>
      {restoring && backups && (
        <RestoreDialog backups={backups} onClose={() => setRestoring(false)} />
      )}
    </div>
  );
}

export function ErrorLogSettings() {
  return (
    <Button icon={FolderOpen} onClick={() => void revealErrorLog()}>
      {t.openLog}
    </Button>
  );
}
