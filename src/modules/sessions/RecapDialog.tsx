import { useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { MentionField } from "../../shared/mentions";
import { Button, Modal } from "../../shared/ui";
import type { Session } from "./domain/types";
import { useSessionsStore } from "./store";

/** The recap dialog of the session chosen in the store ("played", the list, "Где упоминается"). */
export function SessionRecapHost() {
  const recapId = useSessionsStore((s) => s.recapId);
  const session = useSessionsStore((s) => s.sessions.find((x) => x.id === recapId));
  const openRecap = useSessionsStore((s) => s.openRecap);
  if (!session) return null;
  return <RecapDialog key={session.id} session={session} onClose={() => openRecap(null)} />;
}

interface RecapDialogProps {
  session: Session;
  onClose: () => void;
}

function RecapDialog({ session, onClose }: RecapDialogProps) {
  const saveRecap = useSessionsStore((s) => s.saveRecap);
  // The field gives its text when it loses focus, which happens before the button is clicked.
  const text = useRef(session.recap);
  const [onTimeline, setOnTimeline] = useState(
    session.recap === "" || session.recapEventId !== null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = ru.sessions.recap;

  const save = () => {
    setSaving(true);
    setError(null);
    saveRecap(session.id, text.current, onTimeline)
      .then(onClose)
      .catch((e: unknown) => {
        console.error(e);
        setError(t.saveFailed);
        setSaving(false);
      });
  };

  return (
    <Modal
      title={t.title(session.number)}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{session.recap === "" ? t.skip : ru.common.cancel}</Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {ru.common.save}
          </Button>
        </>
      }
    >
      <div className="recap-dialog">
        <MentionField
          label={t.label}
          value={session.recap}
          placeholder={t.placeholder}
          autoFocus
          onCommit={(value) => {
            text.current = value;
          }}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={onTimeline}
            onChange={(e) => setOnTimeline(e.target.checked)}
          />
          {session.recapEventId ? t.keepOnTimeline : t.addToTimeline}
        </label>
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
