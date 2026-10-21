import { useCallback, useRef, useState } from "react";
import {
  CalendarMinus,
  CalendarPlus,
  ChevronDown,
  Funnel,
  History,
  ImageDown,
  Redo2,
  Rows3,
  Undo2,
  X,
} from "lucide-react";
import { renderElementPng } from "../../shared/pngExport";
import { pickSavePath, writeChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, ConfirmDialog, IconButton, themeColor, useDismiss } from "../../shared/ui";
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
  onLanes: () => void;
  /** The whole timeline element, for PNG export. */
  exportSource: () => HTMLElement | null;
}

/** The row under the screen header: sessions, filters, lanes, history and export. */
export function TimelineToolbar({
  campaignName,
  lanes,
  laneNames,
  characters,
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
        themeColor("--canvas"),
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
    <div className="screen-tools graph-tools">
      <div className="toolbar-group">
        <Button
          variant="ghost"
          icon={CalendarPlus}
          onClick={() => edit((tl) => addSession(tl))}
          title={t.addSessionHint}
        >
          {t.addSession}
        </Button>
        <IconButton
          icon={CalendarMinus}
          label={t.removeSession}
          onClick={() => setRemovingSession(true)}
          disabled={last === 0}
        />
      </div>
      <select
        className="tl-current"
        aria-label={t.currentSession}
        title={t.currentSession}
        value={timeline.currentSession ?? ""}
        onChange={(e) =>
          edit((tl) => setCurrentSession(tl, e.target.value === "" ? null : Number(e.target.value)))
        }
      >
        <option value="">{t.noCurrentSession}</option>
        {Array.from({ length: last }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {t.currentOption(n)}
          </option>
        ))}
      </select>
      <div className="toolbar-sep" />
      <Button
        icon={History}
        active={filter.happenedOnly}
        title={t.happenedOnlyHint}
        onClick={() => setFilter({ ...filter, happenedOnly: !filter.happenedOnly })}
      >
        {t.happenedOnly}
      </Button>
      <FilterMenu lanes={lanes} laneNames={laneNames} characters={characters} />
      <IconButton icon={Rows3} label={t.lanes} onClick={onLanes} />
      <span className="spacer" />
      {notice && (
        <span className={notice.kind === "error" ? "toolbar-notice error" : "toolbar-notice"}>
          <span>{notice.text}</span>
          <IconButton icon={X} size="sm" label={ru.common.close} onClick={() => setNotice(null)} />
        </span>
      )}
      <div className="toolbar-group">
        <IconButton
          icon={Undo2}
          label={t.undo}
          shortcut="Ctrl+Z"
          onClick={undo}
          disabled={history.past.length === 0}
        />
        <IconButton
          icon={Redo2}
          label={t.redo}
          shortcut="Ctrl+Y"
          onClick={redo}
          disabled={history.future.length === 0}
        />
      </div>
      <IconButton
        icon={ImageDown}
        label={t.exportPng}
        onClick={() => void exportPng()}
        disabled={busy}
      />

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
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const t = ru.timeline.filter;

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
      <Button
        icon={Funnel}
        active={count > 0}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {count > 0 ? ru.timeline.filtersActive(count) : ru.timeline.filters}
        <ChevronDown aria-hidden />
      </Button>
      {open && (
        <div className="popover filter-menu">
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

          <Button
            size="sm"
            onClick={() => setFilter({ ...noFilter, happenedOnly: filter.happenedOnly })}
            disabled={count === 0}
          >
            {t.reset}
          </Button>
        </div>
      )}
    </div>
  );
}
