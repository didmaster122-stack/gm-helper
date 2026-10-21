import { useState, type ReactNode } from "react";
import { CalendarPlus, Check, ListOrdered, NotebookPen } from "lucide-react";
import { formatDistance, formatWeekday, isDay, localDay } from "../../shared/dates";
import { ru } from "../../shared/i18n/ru";
import { Button } from "../../shared/ui";
import { lastPlayed, nextNumber, nextSession, prepProgress } from "./domain/sessions";
import type { Session } from "./domain/types";
import { PrepList } from "./PrepList";
import { SessionsDialog } from "./SessionsDialog";
import { useSessionsStore } from "./store";

interface NextSessionCardProps {
  /** Shown before the number, e.g. on the welcome screen. */
  campaignName?: string;
  /** Called after the plan note was prepared, to switch to the notes section. */
  onOpenNotes: () => void;
}

/** The next session of the active campaign: date, checklist, plan, "played". */
export function NextSessionCard({ campaignName, onOpenNotes }: NextSessionCardProps) {
  const sessions = useSessionsStore((s) => s.sessions);
  const status = useSessionsStore((s) => s.status);
  const schedule = useSessionsStore((s) => s.schedule);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = ru.sessions;

  if (status !== "ready") return null;
  const next = nextSession(sessions);
  const last = lastPlayed(sessions);

  const run = (action: () => Promise<void>, failed: string = t.saveFailed) => {
    setError(null);
    action().catch((e: unknown) => {
      console.error(e);
      setError(failed);
    });
  };

  const allButton = sessions.length > 0 && (
    <Button variant="ghost" icon={ListOrdered} onClick={() => setShowAll(true)}>
      {t.all}
    </Button>
  );

  return (
    <section className="next-session" aria-label={t.next}>
      {next ? (
        <NextSession
          session={next}
          campaignName={campaignName}
          run={run}
          onOpenNotes={onOpenNotes}
          allButton={allButton}
        />
      ) : (
        <>
          <div className="next-session-head">
            <div>
              <div className="next-session-date">{t.noneYet}</div>
              {last && <div className="next-session-sub">{t.lastPlayed(last.number)}</div>}
            </div>
          </div>
          <div className="next-session-actions">
            <Button variant="primary" icon={CalendarPlus} onClick={() => run(() => schedule())}>
              {t.schedule(nextNumber(sessions))}
            </Button>
            {allButton}
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {showAll && <SessionsDialog onClose={() => setShowAll(false)} />}
    </section>
  );
}

interface NextSessionProps {
  session: Session;
  campaignName: string | undefined;
  run: (action: () => Promise<void>, failed?: string) => void;
  onOpenNotes: () => void;
  allButton: ReactNode;
}

function NextSession({ session, campaignName, run, onOpenNotes, allButton }: NextSessionProps) {
  const setDate = useSessionsStore((s) => s.setDate);
  const editItems = useSessionsStore((s) => s.editItems);
  const markPlayed = useSessionsStore((s) => s.markPlayed);
  const openPlan = useSessionsStore((s) => s.openPlan);
  const t = ru.sessions;
  const today = localDay(new Date());
  const { done, total } = prepProgress(session.items);
  const sub = [
    campaignName,
    t.session(session.number),
    session.date ? formatDistance(session.date, today) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="next-session-head">
        <div>
          <div className="next-session-date">
            {session.date ? formatWeekday(session.date, today) : t.noDate}
          </div>
          <div className="next-session-sub">{sub}</div>
        </div>
        {total > 0 && <span className="next-session-progress">{t.prep.progress(done, total)}</span>}
      </div>
      <label className="field next-session-day">
        <span>{t.date}</span>
        <input
          type="date"
          value={session.date ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            // Typing the year digit by digit passes through years like 0002.
            if (value === "") run(() => setDate(session.id, null));
            else if (isDay(value) && value >= "1900") run(() => setDate(session.id, value));
          }}
        />
      </label>
      <PrepList items={session.items} onChange={(edit) => run(() => editItems(session.id, edit))} />
      <div className="next-session-actions">
        <Button
          icon={NotebookPen}
          onClick={() =>
            run(async () => {
              await openPlan(session.id);
              onOpenNotes();
            }, t.planFailed)
          }
        >
          {t.plan(session.number)}
        </Button>
        <Button variant="primary" icon={Check} onClick={() => run(() => markPlayed(session.id))}>
          {t.played}
        </Button>
        {allButton}
      </div>
    </>
  );
}
