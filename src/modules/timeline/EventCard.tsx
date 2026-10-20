import { useState } from "react";
import { Trash, X } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, CommitField, ConfirmDialog, IconButton, TagEditor } from "../../shared/ui";
import { sessionList } from "./domain/layout";
import {
  moveEvent,
  moveItem,
  removeEvent,
  removeLink,
  removeMarker,
  updateEvent,
  updateMarker,
  type EventPatch,
  type MarkerPatch,
} from "./domain/timeline";
import {
  EVENT_IMPORTANCES,
  EVENT_STATUSES,
  MARKER_LEVELS,
  type CharacterRef,
  type EventLink,
  type Lane,
  type TimeMarker,
  type Timeline,
  type TimelineEvent,
} from "./domain/types";
import { useTimelineStore } from "./store";

const FUTURE = "future";

interface EventCardProps {
  event: TimelineEvent;
  timeline: Timeline;
  lanes: readonly Lane[];
  laneNames: Map<string, string>;
  characters: readonly CharacterRef[];
  onOpenCharacter: (id: string) => void;
}

export function EventCard({
  event: e,
  timeline,
  lanes,
  laneNames,
  characters,
  onOpenCharacter,
}: EventCardProps) {
  const edit = useTimelineStore((s) => s.edit);
  const select = useTimelineStore((s) => s.select);
  const [deleting, setDeleting] = useState(false);
  const t = ru.timeline.event;
  const patch = (p: EventPatch) => edit((tl, src) => updateEvent(tl, e.id, p, src.now));
  const moveTo = (laneId: string, session: number | null) =>
    edit((tl, src) => moveEvent(tl, e.id, laneId, session, null, src.now));

  const charById = new Map(characters.map((c) => [c.id, c]));
  const others = characters.filter((c) => !e.characterIds.includes(c.id));

  return (
    <div className="graph-card" key={e.id}>
      <CommitField
        label={t.title}
        value={e.title}
        required
        onCommit={(title) => patch({ title: title.trim() })}
      />

      <div className="tl-card-row">
        <label className="field">
          <span>{t.lane}</span>
          <select value={e.laneId} onChange={(x) => moveTo(x.target.value, e.session)}>
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {laneNames.get(l.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t.session}</span>
          <select
            value={e.session ?? FUTURE}
            onChange={(x) =>
              moveTo(e.laneId, x.target.value === FUTURE ? null : Number(x.target.value))
            }
          >
            {sessionList(timeline.sessionCount).map((s) => (
              <option key={s ?? FUTURE} value={s ?? FUTURE}>
                {s === null ? ru.timeline.future : ru.timeline.session(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <CommitField
        label={t.gameDate}
        value={e.gameDate}
        placeholder={t.gameDatePlaceholder}
        onCommit={(gameDate) => patch({ gameDate: gameDate.trim() })}
      />

      <div className="field">
        <span>{t.status}</span>
        <div className="segmented tl-statuses">
          {EVENT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={e.status === status ? "active" : ""}
              onClick={() => patch({ status })}
            >
              {ru.timeline.statuses[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>{t.importance}</span>
        <div className="segmented">
          {EVENT_IMPORTANCES.map((importance) => (
            <button
              key={importance}
              type="button"
              className={e.importance === importance ? "active" : ""}
              onClick={() => patch({ importance })}
            >
              {ru.timeline.importances[importance]}
            </button>
          ))}
        </div>
      </div>

      <section className="card-section">
        <h3 className="subheading">{t.characters}</h3>
        {e.characterIds.length === 0 ? (
          <p className="muted">{t.noCharacters}</p>
        ) : (
          <ul className="faction-list">
            {e.characterIds.map((id) => {
              const c = charById.get(id);
              const name = c?.name ?? t.missingCharacter;
              return (
                <li key={id}>
                  {c ? (
                    <button
                      type="button"
                      className="link"
                      title={t.openCharacter(name)}
                      onClick={() => onOpenCharacter(id)}
                    >
                      {name}
                    </button>
                  ) : (
                    <span className="muted">{name}</span>
                  )}
                  {c?.isPc && <small className="muted">{ru.relations.kinds.pc}</small>}
                  <IconButton
                    icon={X}
                    size="sm"
                    className="faction-remove"
                    label={t.removeCharacter(name)}
                    onClick={() => patch({ characterIds: e.characterIds.filter((x) => x !== id) })}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {others.length > 0 && (
          <select
            value=""
            onChange={(x) => {
              if (x.target.value) patch({ characterIds: [...e.characterIds, x.target.value] });
            }}
          >
            <option value="">{t.addCharacter}</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <TagEditor label={t.tags} tags={e.tags} onChange={(tags) => patch({ tags })} />

      <CommitField
        label={t.description}
        value={e.description}
        multiline
        onCommit={(description) => patch({ description })}
      />

      <LinkList
        title={t.causes}
        empty={t.noCauses}
        links={timeline.links.filter((l) => l.toId === e.id)}
        otherEnd={(l) => l.fromId}
        timeline={timeline}
      />
      <LinkList
        title={t.consequences}
        empty={t.noConsequences}
        links={timeline.links.filter((l) => l.fromId === e.id)}
        otherEnd={(l) => l.toId}
        timeline={timeline}
      />

      <div className="panel-actions">
        <Button variant="danger" icon={Trash} onClick={() => setDeleting(true)}>
          {t.delete}
        </Button>
      </div>

      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(e.title)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => {
            edit((tl) => removeEvent(tl, e.id));
            select(null);
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

interface LinkListProps {
  title: string;
  empty: string;
  links: EventLink[];
  otherEnd: (link: EventLink) => string;
  timeline: Timeline;
}

function LinkList({ title, empty, links, otherEnd, timeline }: LinkListProps) {
  const edit = useTimelineStore((s) => s.edit);
  const select = useTimelineStore((s) => s.select);
  const setFocus = useTimelineStore((s) => s.setFocus);
  const byId = new Map(timeline.events.map((e) => [e.id, e]));

  return (
    <section className="card-section">
      <h3 className="subheading">{title}</h3>
      {links.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="faction-list">
          {links.map((l) => {
            const other = byId.get(otherEnd(l));
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    if (!other) return;
                    select({ kind: "event", id: other.id });
                    setFocus(other.id);
                  }}
                >
                  {other?.title ?? "—"}
                </button>
                <small className="muted">
                  {other?.session ? ru.timeline.session(other.session) : ru.timeline.future}
                </small>
                <IconButton
                  icon={X}
                  size="sm"
                  className="faction-remove"
                  label={ru.timeline.event.removeLink}
                  onClick={() => edit((tl) => removeLink(tl, l.id))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Side panel of a selected link. */
export function LinkCard({ link, timeline }: { link: EventLink; timeline: Timeline }) {
  const edit = useTimelineStore((s) => s.edit);
  const select = useTimelineStore((s) => s.select);
  const setFocus = useTimelineStore((s) => s.setFocus);
  const t = ru.timeline.link;
  const byId = new Map(timeline.events.map((e) => [e.id, e]));

  const end = (label: string, id: string) => (
    <div className="field">
      <span>{label}</span>
      <button
        type="button"
        className="link"
        onClick={() => {
          select({ kind: "event", id });
          setFocus(id);
        }}
      >
        {byId.get(id)?.title ?? "—"}
      </button>
    </div>
  );

  return (
    <div className="graph-card" key={link.id}>
      <h2 className="graph-card-title">{t.title}</h2>
      {end(t.from, link.fromId)}
      {end(t.to, link.toId)}
      <div className="panel-actions">
        <Button
          variant="danger"
          icon={Trash}
          onClick={() => {
            edit((tl) => removeLink(tl, link.id));
            select(null);
          }}
        >
          {t.delete}
        </Button>
      </div>
    </div>
  );
}

/** Side panel of a selected time marker. */
export function MarkerCard({ marker: m, timeline }: { marker: TimeMarker; timeline: Timeline }) {
  const edit = useTimelineStore((s) => s.edit);
  const select = useTimelineStore((s) => s.select);
  const t = ru.timeline.marker;
  const patch = (p: MarkerPatch) => edit((tl, src) => updateMarker(tl, m.id, p, src.now));

  return (
    <div className="graph-card" key={m.id}>
      <h2 className="graph-card-title">{t.title}</h2>
      <CommitField
        label={t.label}
        value={m.label}
        placeholder={t.labelPlaceholder}
        required
        onCommit={(label) => patch({ label: label.trim() })}
      />
      <div className="field">
        <span>{t.level}</span>
        <div className="segmented tl-levels">
          {MARKER_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={m.level === level ? "active" : ""}
              onClick={() => patch({ level })}
            >
              {t.levels[level]}
            </button>
          ))}
        </div>
        <small className="hint">{t.levelHint}</small>
      </div>
      <label className="field">
        <span>{ru.timeline.event.session}</span>
        <select
          value={m.session ?? FUTURE}
          onChange={(x) => {
            const session = x.target.value === FUTURE ? null : Number(x.target.value);
            edit((tl, src) => moveItem(tl, { kind: "marker", id: m.id }, session, null, src.now));
          }}
        >
          {sessionList(timeline.sessionCount).map((s) => (
            <option key={s ?? FUTURE} value={s ?? FUTURE}>
              {s === null ? ru.timeline.future : ru.timeline.session(s)}
            </option>
          ))}
        </select>
      </label>
      <small className="hint">{t.moveHint}</small>
      <div className="panel-actions">
        <Button
          variant="danger"
          icon={Trash}
          onClick={() => {
            edit((tl) => removeMarker(tl, m.id));
            select(null);
          }}
        >
          {t.delete}
        </Button>
      </div>
    </div>
  );
}
