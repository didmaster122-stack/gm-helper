import { useState } from "react";
import { CalendarPlus, Trash } from "lucide-react";
import { isDay } from "../../shared/dates";
import { ru } from "../../shared/i18n/ru";
import { Button, ConfirmDialog, IconButton, Modal } from "../../shared/ui";
import { nextNumber, numberError } from "./domain/sessions";
import type { Session } from "./domain/types";
import { useSessionsStore } from "./store";

/** Every session of the campaign: number, date, "played", delete. */
export function SessionsDialog({ onClose }: { onClose: () => void }) {
  const sessions = useSessionsStore((s) => s.sessions);
  const schedule = useSessionsStore((s) => s.schedule);
  const remove = useSessionsStore((s) => s.remove);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = ru.sessions;

  const run = (action: () => Promise<void>) => {
    setError(null);
    action().catch((e: unknown) => {
      console.error(e);
      setError(t.saveFailed);
    });
  };

  return (
    <Modal
      title={t.allTitle}
      onClose={onClose}
      footer={
        <>
          <Button icon={CalendarPlus} onClick={() => run(() => schedule())}>
            {t.schedule(nextNumber(sessions))}
          </Button>
          <Button onClick={onClose}>{ru.common.close}</Button>
        </>
      }
    >
      {sessions.length === 0 ? (
        <p className="muted">{t.noneYet}</p>
      ) : (
        <table className="sessions-table">
          <thead>
            <tr>
              <th>{t.number}</th>
              <th>{t.date}</th>
              <th>{t.playedLabel}</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                sessions={sessions}
                run={run}
                onDelete={() => setDeleting(s)}
              />
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="error">{error}</p>}
      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(deleting.number)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </Modal>
  );
}

interface SessionRowProps {
  session: Session;
  sessions: readonly Session[];
  run: (action: () => Promise<void>) => void;
  onDelete: () => void;
}

function SessionRow({ session, sessions, run, onDelete }: SessionRowProps) {
  const setNumber = useSessionsStore((s) => s.setNumber);
  const setDate = useSessionsStore((s) => s.setDate);
  const markPlayed = useSessionsStore((s) => s.markPlayed);
  const unmarkPlayed = useSessionsStore((s) => s.unmarkPlayed);
  const [draft, setDraft] = useState(String(session.number));
  const [seen, setSeen] = useState(session.number);
  if (session.number !== seen) {
    setSeen(session.number);
    setDraft(String(session.number));
  }
  const t = ru.sessions;
  const number = Number(draft);
  const problem =
    draft === String(session.number) ? null : numberError(sessions, session.id, number);

  return (
    <tr className={session.played ? "played" : undefined}>
      <td>
        <input
          className="sessions-number"
          type="number"
          min={1}
          step={1}
          value={draft}
          aria-label={t.number}
          aria-invalid={problem !== null}
          title={problem === "taken" ? t.numberTaken : problem ? t.numberInvalid : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (problem || number === session.number) setDraft(String(session.number));
            else run(() => setNumber(session.id, number));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        {problem && (
          <small className="error">{problem === "taken" ? t.numberTaken : t.numberInvalid}</small>
        )}
      </td>
      <td>
        <input
          type="date"
          value={session.date ?? ""}
          aria-label={t.date}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "") run(() => setDate(session.id, null));
            else if (isDay(value) && value >= "1900") run(() => setDate(session.id, value));
          }}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={session.played}
          aria-label={t.playedLabel}
          onChange={() =>
            run(() => (session.played ? unmarkPlayed(session.id) : markPlayed(session.id)))
          }
        />
      </td>
      <td>
        <IconButton
          icon={Trash}
          size="sm"
          className="danger"
          label={ru.common.delete}
          onClick={onDelete}
        />
      </td>
    </tr>
  );
}
