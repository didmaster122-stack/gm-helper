import { useEffect, useRef, useState } from "react";
import { renderElementPng } from "../../shared/pngExport";
import { pickSavePath, writeChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog } from "../../shared/ui";
import { activeFilters, allTags, noFilter, type TimelineFilter } from "./domain/filter";
import { addSession, removeLastSession, setCurrentSession } from "./domain/timeline";
import { EVENT_STATUSES, type CharacterRef, type EventStatus, type Lane } from "./domain/types";
import { useTimeline, useTimelineStore } from "./store";

type Notice = { kind: "info" | "error"; text: string } | null;

interface TimelineToolbarProps {
  campaignName: string;
  lanes: readonly Lane[];
  laneNames: Map<string, string>;
  characters: readonly CharacterRef[];
  onNewEvent: () => void;
  onNewMarker: () => void;
  onLanes: () => void;
  /** The whole timeline element, for PNG export. */
  exportSource: () => HTMLElement | null;
}

export function TimelineToolbar({
  campaignName,
  lanes,
  laneNames,
  characters,
  onNewEvent,
  onNewMarker,
  onLanes,
  exportSource,
}: TimelineToolbarProps) {
  const t = ru.timeline;
  const timeline = useTimeline();
  const history = useTimelineStore((s) => s.history);
  const filter = useTimelineStore((s) => s.filter);
  const setFilter = useTimelineStore((s) => s.setFilter);
  const undo = useTimelineStore((s) => s.undo);
  const redo = useTimelineStore((s) => s.redo);
  const edit = useTimelineStore((s) => s.edit);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [removingSession, setRemovingSession] = useState(false);
  const last = timeline.sessionCount;

  async function exportPng() {
    setNotice(null);
    const source = exportSource();
    if (!source) return;
    setBusy(true);
    try {
      const bytes = await renderElementPng(
        source,
        source.offsetWidth,
        source.offsetHeight,
        "#16171c",
      );
      const path = await pickSavePath(t.exportTitle, `${campaignName} — ${ru.nav.timeline}.png`, [
        { name: t.exportFilter, extensions: ["png"] },
      ]);
      if (path) {
        await writeChosenFile(path, bytes);
        setNotice({ kind: "info", text: t.exportDone(path) });
      }
    } catch (error) {
      setNotice({ kind: "error", text: t.exportFailed(String(error)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="graph-toolbar">
      <button type="button" onClick={onNewEvent} title={t.newEventHint}>
        + {t.newEvent}
      </button>
      <button type="button" onClick={onNewMarker} title={t.marker.newHint}>
        + {t.marker.new}
      </button>
      <div className="toolbar-group">
        <button type="button" onClick={() => edit((tl) => addSession(tl))} title={t.addSessionHint}>
          {t.addSession}
        </button>
        <button
          type="button"
          onClick={() => setRemovingSession(true)}
          disabled={last === 0}
          title={t.removeSessionHint}
        >
          {t.removeSession}
        </button>
      </div>
      <label className="tl-current">
        <span>{t.currentSession}</span>
        <select
          value={timeline.currentSession ?? ""}
          onChange={(e) =>
            edit((tl) =>
              setCurrentSession(tl, e.target.value === "" ? null : Number(e.target.value)),
            )
          }
        >
          <option value="">{t.noCurrentSession}</option>
          {Array.from({ length: last }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={filter.happenedOnly ? "active" : ""}
        aria-pressed={filter.happenedOnly}
        title={t.happenedOnlyHint}
        onClick={() => setFilter({ ...filter, happenedOnly: !filter.happenedOnly })}
      >
        {t.happenedOnly}
      </button>
      <FilterMenu lanes={lanes} laneNames={laneNames} characters={characters} />
      <button type="button" onClick={onLanes}>
        {t.lanes}
      </button>
      <span className="spacer" />
      {notice && (
        <span
          className={notice.kind === "error" ? "error graph-notice" : "muted graph-notice"}
          onClick={() => setNotice(null)}
        >
          {notice.text}
        </span>
      )}
      <div className="toolbar-group">
        <button type="button" onClick={undo} disabled={history.past.length === 0} title={t.undo}>
          ↶
        </button>
        <button type="button" onClick={redo} disabled={history.future.length === 0} title={t.redo}>
          ↷
        </button>
      </div>
      <button type="button" onClick={() => void exportPng()} disabled={busy} title={t.exportTitle}>
        {t.exportPng}
      </button>

      {removingSession && (
        <ConfirmDialog
          title={t.removeSessionTitle}
          text={t.removeSessionText(last, timeline.events.filter((e) => e.session === last).length)}
          confirmLabel={ru.common.delete}
          onConfirm={() => edit((tl, src) => removeLastSession(tl, src.now))}
          onClose={() => setRemovingSession(false)}
        />
      )}
    </div>
  );
}

interface FilterMenuProps {
  lanes: readonly Lane[];
  laneNames: Map<string, string>;
  characters: readonly CharacterRef[];
}

function FilterMenu({ lanes, laneNames, characters }: FilterMenuProps) {
  const timeline = useTimeline();
  const filter = useTimelineStore((s) => s.filter);
  const setFilter = useTimelineStore((s) => s.setFilter);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = ru.timeline.filter;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const update = (patch: Partial<TimelineFilter>) => setFilter({ ...filter, ...patch });
  const count = activeFilters(filter);
  const tags = allTags(timeline);
  const involved = new Set(timeline.events.flatMap((e) => e.characterIds));
  const people = characters.filter((c) => involved.has(c.id) || c.id === filter.characterId);

  function toggleStatus(status: EventStatus) {
    const next = new Set(filter.statuses ?? EVENT_STATUSES);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    update({ statuses: next.size === EVENT_STATUSES.length ? null : next });
  }

  return (
    <div className="graph-filter" ref={ref}>
      <button
        type="button"
        className={count > 0 ? "active" : ""}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {count > 0 ? ru.timeline.filtersActive(count) : ru.timeline.filters} ▾
      </button>
      {open && (
        <div className="graph-filter-menu">
          <label className="field">
            <span>{t.lane}</span>
            <select
              value={filter.laneId ?? ""}
              onChange={(e) => update({ laneId: e.target.value || null })}
            >
              <option value="">{t.allLanes}</option>
              {lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {laneNames.get(l.id)}
                </option>
              ))}
            </select>
          </label>

          <h4>{t.statuses}</h4>
          {EVENT_STATUSES.map((s) => (
            <label key={s} className="check">
              <input
                type="checkbox"
                checked={filter.statuses?.has(s) ?? true}
                onChange={() => toggleStatus(s)}
              />
              <span>{ru.timeline.statuses[s]}</span>
            </label>
          ))}

          <label className="field">
            <span>{t.character}</span>
            <select
              value={filter.characterId ?? ""}
              onChange={(e) => update({ characterId: e.target.value || null })}
            >
              <option value="">{t.anyCharacter}</option>
              {people.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t.tag}</span>
            <select
              value={filter.tag ?? ""}
              onChange={(e) => update({ tag: e.target.value || null })}
            >
              <option value="">{t.anyTag}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setFilter({ ...noFilter, happenedOnly: filter.happenedOnly })}
            disabled={count === 0}
          >
            {t.reset}
          </button>
        </div>
      )}
    </div>
  );
}
