import { useEffect } from "react";
import { ru } from "../../shared/i18n/ru";
import { useTimeline, useTimelineStore } from "./store";

interface CharacterEventsProps {
  campaignId: string;
  characterId: string;
  /** Opens the event on the timeline. */
  onOpenEvent: (id: string) => void;
}

/** Events of the timeline in which a character takes part (for the character card). */
export function CharacterEvents({ campaignId, characterId, onOpenEvent }: CharacterEventsProps) {
  const load = useTimelineStore((s) => s.load);
  const status = useTimelineStore((s) => s.status);
  const loadedFor = useTimelineStore((s) => s.campaignId);
  const timeline = useTimeline();
  const t = ru.timeline;

  useEffect(() => {
    void load(campaignId);
  }, [load, campaignId]);

  const ready = status === "ready" && loadedFor === campaignId;
  // Future events (no session) go last.
  const order = (session: number | null) => session ?? Number.MAX_SAFE_INTEGER;
  const events = ready
    ? timeline.events
        .filter((e) => e.characterIds.includes(characterId))
        .sort((a, b) => order(a.session) - order(b.session) || a.sort - b.sort)
    : [];

  return (
    <section className="card-section">
      <h3 className="subheading">{t.characterEvents.title}</h3>
      {!ready ? (
        <p className="muted">{status === "error" ? t.loadFailed : ru.common.loading}</p>
      ) : events.length === 0 ? (
        <p className="muted">{t.characterEvents.none}</p>
      ) : (
        <ul className="relation-list">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`relation-row tl-event-row status-${e.status}`}
                onClick={() => onOpenEvent(e.id)}
              >
                <span className="muted">
                  {e.session === null ? t.future : t.session(e.session)}
                </span>
                <span className="relation-other">{e.title}</span>
                <span className="muted relation-label">{t.statuses[e.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
