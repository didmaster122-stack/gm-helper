import { useEffect, useMemo, useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { EmptyState } from "../../shared/ui";
import type { Campaign } from "../campaigns";
import { useGraph, useRelationsStore } from "../relations";
import { noFilter, visibleEvents } from "./domain/filter";
import {
  insertEvent,
  insertMarker,
  mainLane,
  removeEvent,
  removeLink,
  removeMarker,
  shownLanes,
} from "./domain/timeline";
import type { CharacterRef } from "./domain/types";
import { EventCard, LinkCard, MarkerCard } from "./EventCard";
import { laneNames as makeLaneNames } from "./laneNames";
import { LanesDialog } from "./LanesDialog";
import { useTimeline, useTimelineStore } from "./store";
import { TimelineBoard } from "./TimelineBoard";
import { TimelineToolbar } from "./TimelineToolbar";

interface TimelineScreenProps {
  campaign: Campaign;
  /** Shows a character on the relation graph. */
  onOpenCharacter: (id: string) => void;
}

export function TimelineScreen({ campaign, onOpenCharacter }: TimelineScreenProps) {
  const load = useTimelineStore((s) => s.load);
  const status = useTimelineStore((s) => s.status);
  const loadedFor = useTimelineStore((s) => s.campaignId);
  const loadRelations = useRelationsStore((s) => s.load);
  const relationsStatus = useRelationsStore((s) => s.status);
  const relationsFor = useRelationsStore((s) => s.campaignId);

  useEffect(() => {
    void load(campaign.id);
  }, [load, campaign.id]);
  useEffect(() => {
    void loadRelations(campaign.id);
  }, [loadRelations, campaign.id]);

  if (status === "error") {
    return (
      <EmptyState
        title={ru.timeline.loadFailed}
        action={
          <button type="button" onClick={() => void load(campaign.id, true)}>
            {ru.common.retry}
          </button>
        }
      />
    );
  }
  // Without the characters, personal lanes and names cannot be shown; a graph that
  // failed to load leaves the timeline usable without them.
  const charactersPending =
    relationsFor !== campaign.id || relationsStatus === "loading" || relationsStatus === "idle";
  if (status !== "ready" || loadedFor !== campaign.id || charactersPending) {
    return <div className="center muted">{ru.common.loading}</div>;
  }

  return <TimelineView key={campaign.id} campaign={campaign} onOpenCharacter={onOpenCharacter} />;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function TimelineView({ campaign, onOpenCharacter }: TimelineScreenProps) {
  const timeline = useTimeline();
  const graph = useGraph();
  const selection = useTimelineStore((s) => s.selection);
  const filter = useTimelineStore((s) => s.filter);
  const focusId = useTimelineStore((s) => s.focusId);
  const setFilter = useTimelineStore((s) => s.setFilter);
  const edit = useTimelineStore((s) => s.edit);
  const saveError = useTimelineStore((s) => s.saveError);
  const clearSaveError = useTimelineStore((s) => s.clearSaveError);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [lanesOpen, setLanesOpen] = useState(false);

  const characters = useMemo<CharacterRef[]>(
    () => graph.characters.map((c) => ({ id: c.id, name: c.name, isPc: c.kind === "pc" })),
    [graph.characters],
  );
  const characterNames = useMemo(
    () => new Map(characters.map((c) => [c.id, c.name])),
    [characters],
  );

  const lanes = useMemo(() => shownLanes(timeline, characters), [timeline, characters]);
  const names = useMemo(
    () => makeLaneNames(timeline.lanes, characters),
    [timeline.lanes, characters],
  );
  const unhidden = useMemo(() => lanes.filter((l) => !l.hidden), [lanes]);
  const gridLanes = useMemo(
    () => (filter.laneId ? unhidden.filter((l) => l.id === filter.laneId) : unhidden),
    [unhidden, filter.laneId],
  );
  const events = useMemo(() => {
    const onGrid = new Set(gridLanes.map((l) => l.id));
    return visibleEvents(timeline, filter).filter((e) => onGrid.has(e.laneId));
  }, [timeline, filter, gridLanes]);

  // An event to show that filters hide: drop the filters.
  useEffect(() => {
    if (!focusId || !timeline.events.some((e) => e.id === focusId)) return;
    if (!events.some((e) => e.id === focusId) && filter !== noFilter) setFilter(noFilter);
  }, [focusId, timeline.events, events, filter, setFilter]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector(".modal-backdrop")) return;
      const s = useTimelineStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      // e.code is layout-independent, so shortcuts also work with the Russian layout.
      if (ctrl && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (ctrl && e.code === "KeyY") {
        e.preventDefault();
        s.redo();
      } else if (e.key === "Delete" && s.selection) {
        const { kind, id } = s.selection;
        s.edit((t) =>
          kind === "link"
            ? removeLink(t, id)
            : kind === "marker"
              ? removeMarker(t, id)
              : removeEvent(t, id),
        );
        s.select(null);
      } else if (e.key === "Escape") {
        s.select(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function createEvent(laneId: string, session: number | null, beforeId: string | null) {
    const id = crypto.randomUUID();
    // An event in a personal lane involves its character.
    const owner = lanes.find((l) => l.id === laneId)?.characterId;
    edit((t, src) =>
      insertEvent(
        t,
        {
          id,
          campaignId: src.campaignId,
          laneId,
          session,
          sort: 0,
          title: ru.timeline.newEventTitle,
          description: "",
          gameDate: "",
          importance: "major",
          status: "planned",
          characterIds: owner ? [owner] : [],
          tags: [],
          createdAt: src.now,
          updatedAt: src.now,
        },
        beforeId,
      ),
    );
    useTimelineStore.setState({ selection: { kind: "event", id }, focusId: id });
  }

  function createMarker(session: number | null, beforeId: string | null) {
    const id = crypto.randomUUID();
    edit((t, src) =>
      insertMarker(
        t,
        {
          id,
          campaignId: src.campaignId,
          label: ru.timeline.marker.newLabel,
          level: 1,
          session,
          sort: 0,
          createdAt: src.now,
          updatedAt: src.now,
        },
        beforeId,
      ),
    );
    useTimelineStore.setState({ selection: { kind: "marker", id }, focusId: id });
  }

  function newEvent() {
    const main = mainLane(timeline);
    if (main) createEvent(main.id, timeline.currentSession, null);
  }

  let card = null;
  if (selection?.kind === "event") {
    const e = timeline.events.find((x) => x.id === selection.id);
    if (e) {
      card = (
        <EventCard
          event={e}
          timeline={timeline}
          lanes={lanes}
          laneNames={names}
          characters={[...characters].sort((a, b) => a.name.localeCompare(b.name, "ru"))}
          onOpenCharacter={onOpenCharacter}
        />
      );
    }
  } else if (selection?.kind === "link") {
    const l = timeline.links.find((x) => x.id === selection.id);
    if (l) card = <LinkCard link={l} timeline={timeline} />;
  } else if (selection?.kind === "marker") {
    const m = timeline.markers.find((x) => x.id === selection.id);
    if (m) card = <MarkerCard marker={m} timeline={timeline} />;
  }

  const allHidden = timeline.events.length > 0 && events.length === 0;

  return (
    <div className="relations">
      <TimelineToolbar
        campaignName={campaign.name}
        lanes={unhidden}
        laneNames={names}
        characters={characters}
        onNewEvent={newEvent}
        onNewMarker={() => createMarker(timeline.currentSession, null)}
        onLanes={() => setLanesOpen(true)}
        exportSource={() => canvasRef.current?.querySelector<HTMLElement>(".tl-content") ?? null}
      />
      {saveError && (
        <div className="notice error" onClick={clearSaveError}>
          {ru.timeline.saveFailed(saveError)}
        </div>
      )}
      <div className="relations-body tl-body">
        <div className="relations-canvas" ref={canvasRef}>
          <TimelineBoard
            timeline={timeline}
            lanes={gridLanes}
            events={events}
            laneNames={names}
            characterNames={characterNames}
            onCreateEvent={(place) => {
              if (place.laneId) createEvent(place.laneId, place.session, place.beforeId);
            }}
            onCreateMarker={(place) => createMarker(place.session, place.beforeId)}
          />
          {(timeline.events.length === 0 || allHidden) && (
            <div className="tl-hint">
              {allHidden ? ru.timeline.hiddenByFilter : ru.timeline.emptyHint}
            </div>
          )}
        </div>
        {card && <aside className="graph-side">{card}</aside>}
      </div>

      {lanesOpen && (
        <LanesDialog
          timeline={timeline}
          lanes={lanes}
          laneNames={names}
          characters={characters}
          onClose={() => setLanesOpen(false)}
        />
      )}
    </div>
  );
}
