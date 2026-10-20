import type { CharacterRef, EventLink, Lane, TimeMarker, Timeline, TimelineEvent } from "./types";

// Pure edits of a timeline. Each returns the same object when nothing changes,
// and keeps unchanged entities by reference (the repository saves only the difference).

export interface IdSource {
  campaignId: string;
  now: string;
  newId: () => string;
}

function makeLane(
  src: IdSource,
  patch: Pick<Lane, "kind" | "name" | "characterId" | "sort">,
): Lane {
  return {
    id: src.newId(),
    campaignId: src.campaignId,
    hidden: false,
    createdAt: src.now,
    updatedAt: src.now,
    ...patch,
  };
}

function nextSort(items: readonly { sort: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sort + 1), 0);
}

export function mainLane(t: Timeline): Lane | undefined {
  return t.lanes.find((l) => l.kind === "main");
}

/**
 * A new timeline gets the main lane, a side quest lane and one session;
 * an existing one gets its main lane back if it is missing.
 */
export function ensureDefaults(t: Timeline, sideLaneName: string, src: IdSource): Timeline {
  if (t.lanes.length === 0) {
    return {
      ...t,
      sessionCount: Math.max(t.sessionCount, 1),
      currentSession: t.currentSession ?? 1,
      lanes: [
        makeLane(src, { kind: "main", name: "", characterId: null, sort: 0 }),
        makeLane(src, { kind: "custom", name: sideLaneName, characterId: null, sort: 1 }),
      ],
    };
  }
  if (mainLane(t)) return t;
  const lanes = t.lanes.map((l) => ({ ...l, sort: l.sort + 1 }));
  return {
    ...t,
    lanes: [makeLane(src, { kind: "main", name: "", characterId: null, sort: 0 }), ...lanes],
  };
}

/** Player characters that can get a personal lane (they have none yet). */
export function charactersWithoutLane(
  t: Timeline,
  characters: readonly CharacterRef[],
): CharacterRef[] {
  const has = new Set(t.lanes.flatMap((l) => (l.characterId ? [l.characterId] : [])));
  return characters.filter((c) => c.isPc && !has.has(c.id));
}

/** Adds a personal lane of a player character at the end (once per character). */
export function addPersonalLane(t: Timeline, character: CharacterRef, src: IdSource): Timeline {
  if (t.lanes.some((l) => l.characterId === character.id)) return t;
  const lane = makeLane(src, {
    kind: "personal",
    name: character.name,
    characterId: character.id,
    sort: nextSort(t.lanes),
  });
  return { ...t, lanes: [...t.lanes, lane] };
}

export function lanesInOrder(t: Timeline): Lane[] {
  return [...t.lanes].sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Lanes shown on the timeline. A personal lane of a character that is no longer
 * a player character (or was deleted) is kept only while it has events.
 */
export function shownLanes(t: Timeline, characters: readonly CharacterRef[]): Lane[] {
  const pcs = new Set(characters.filter((c) => c.isPc).map((c) => c.id));
  const used = new Set(t.events.map((e) => e.laneId));
  return lanesInOrder(t).filter(
    (l) =>
      l.kind !== "personal" || (l.characterId !== null && pcs.has(l.characterId)) || used.has(l.id),
  );
}

// ---- Order inside a session ----

/** Something that takes a place in the order of a session: an event or a time marker. */
export interface ItemRef {
  kind: "event" | "marker";
  id: string;
}

interface Sorted extends ItemRef {
  sort: number;
  createdAt: string;
}

/** Events and time markers of a session in their order (top to bottom). */
export function sessionItems(t: Timeline, session: number | null): ItemRef[] {
  const items: Sorted[] = [
    ...t.events
      .filter((e) => e.session === session)
      .map((e) => ({ kind: "event" as const, id: e.id, sort: e.sort, createdAt: e.createdAt })),
    ...t.markers
      .filter((m) => m.session === session)
      .map((m) => ({ kind: "marker" as const, id: m.id, sort: m.sort, createdAt: m.createdAt })),
  ];
  return items
    .sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt))
    .map(({ kind, id }) => ({ kind, id }));
}

function endSort(t: Timeline, session: number | null): number {
  return nextSort([
    ...t.events.filter((e) => e.session === session),
    ...t.markers.filter((m) => m.session === session),
  ]);
}

/**
 * Moves an event or a marker to a session, before `beforeId` (an item of that
 * session) or to its end; an event can change its lane too. The session is renumbered.
 */
export function moveItem(
  t: Timeline,
  item: ItemRef,
  session: number | null,
  beforeId: string | null,
  now: string,
  laneId?: string,
): Timeline {
  const current =
    item.kind === "event"
      ? t.events.find((e) => e.id === item.id)
      : t.markers.find((m) => m.id === item.id);
  if (!current || beforeId === item.id) return t;
  const order = sessionItems(t, session).filter((x) => x.id !== item.id);
  const at = beforeId === null ? -1 : order.findIndex((x) => x.id === beforeId);
  order.splice(at < 0 ? order.length : at, 0, item);
  const sorts = new Map(order.map((x, i) => [x.id, i]));

  const event = item.kind === "event" ? t.events.find((e) => e.id === item.id) : undefined;
  const newLane = event !== undefined && laneId !== undefined && event.laneId !== laneId;
  const moved = current.session !== session || newLane;
  let changed = false;
  function place<T extends TimelineEvent | TimeMarker>(x: T): T {
    const sort = sorts.get(x.id);
    if (sort === undefined) return x;
    if (x.id === item.id && moved) {
      changed = true;
      const lane = item.kind === "event" && laneId !== undefined ? { laneId } : {};
      return { ...x, ...lane, session, sort, updatedAt: now };
    }
    if (x.sort === sort) return x;
    changed = true;
    return x.id === item.id ? { ...x, sort, updatedAt: now } : { ...x, sort };
  }
  const events = t.events.map(place);
  const markers = t.markers.map(place);
  return changed ? { ...t, events, markers } : t;
}

// ---- Events ----

/** Adds an event at the end of its session. */
export function addEvent(t: Timeline, event: TimelineEvent): Timeline {
  return { ...t, events: [...t.events, { ...event, sort: endSort(t, event.session) }] };
}

/** Adds an event before `beforeId` (an item of its session) or at the end of the session. */
export function insertEvent(t: Timeline, event: TimelineEvent, beforeId: string | null): Timeline {
  const next = addEvent(t, event);
  return beforeId === null
    ? next
    : moveItem(next, { kind: "event", id: event.id }, event.session, beforeId, event.createdAt);
}

export type EventPatch = Partial<
  Pick<
    TimelineEvent,
    "title" | "description" | "gameDate" | "importance" | "status" | "characterIds" | "tags"
  >
>;

function samePatch<T extends object>(item: T, patch: Partial<T>): boolean {
  return (Object.keys(patch) as (keyof T)[]).every((key) => {
    const a = item[key];
    const b = patch[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return a === b;
  });
}

export function updateEvent(t: Timeline, id: string, patch: EventPatch, now: string): Timeline {
  const event = t.events.find((e) => e.id === id);
  if (!event || samePatch(event, patch)) return t;
  return {
    ...t,
    events: t.events.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now } : e)),
  };
}

/** Removes an event with its links. */
export function removeEvent(t: Timeline, id: string): Timeline {
  if (!t.events.some((e) => e.id === id)) return t;
  return {
    ...t,
    events: t.events.filter((e) => e.id !== id),
    links: t.links.filter((l) => l.fromId !== id && l.toId !== id),
  };
}

export function moveEvent(
  t: Timeline,
  id: string,
  laneId: string,
  session: number | null,
  beforeId: string | null,
  now: string,
): Timeline {
  return moveItem(t, { kind: "event", id }, session, beforeId, now, laneId);
}

// ---- Time markers ----

export function insertMarker(t: Timeline, marker: TimeMarker, beforeId: string | null): Timeline {
  const next = { ...t, markers: [...t.markers, { ...marker, sort: endSort(t, marker.session) }] };
  return beforeId === null
    ? next
    : moveItem(next, { kind: "marker", id: marker.id }, marker.session, beforeId, marker.createdAt);
}

export type MarkerPatch = Partial<Pick<TimeMarker, "label" | "level">>;

export function updateMarker(t: Timeline, id: string, patch: MarkerPatch, now: string): Timeline {
  const marker = t.markers.find((m) => m.id === id);
  if (!marker || samePatch(marker, patch)) return t;
  return {
    ...t,
    markers: t.markers.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now } : m)),
  };
}

export function removeMarker(t: Timeline, id: string): Timeline {
  return t.markers.some((m) => m.id === id)
    ? { ...t, markers: t.markers.filter((m) => m.id !== id) }
    : t;
}

// ---- Links ----

export function canLink(t: Timeline, fromId: string, toId: string): boolean {
  if (fromId === toId) return false;
  const ids = new Set(t.events.map((e) => e.id));
  if (!ids.has(fromId) || !ids.has(toId)) return false;
  return !t.links.some((l) => l.fromId === fromId && l.toId === toId);
}

export function addLink(t: Timeline, link: EventLink): Timeline {
  return canLink(t, link.fromId, link.toId) ? { ...t, links: [...t.links, link] } : t;
}

export function removeLink(t: Timeline, id: string): Timeline {
  return t.links.some((l) => l.id === id) ? { ...t, links: t.links.filter((l) => l.id !== id) } : t;
}

// ---- Sessions ----

export function addSession(t: Timeline): Timeline {
  return { ...t, sessionCount: t.sessionCount + 1 };
}

/** Removes the last session; its events and markers go to the end of "Future". */
export function removeLastSession(t: Timeline, now: string): Timeline {
  const last = t.sessionCount;
  if (last === 0) return t;
  let next: Timeline = {
    ...t,
    sessionCount: last - 1,
    currentSession:
      t.currentSession !== null && t.currentSession >= last
        ? last > 1
          ? last - 1
          : null
        : t.currentSession,
  };
  for (const item of sessionItems(t, last)) next = moveItem(next, item, null, null, now);
  return next;
}

export function setCurrentSession(t: Timeline, session: number | null): Timeline {
  if (session !== null && (session < 1 || session > t.sessionCount)) return t;
  return t.currentSession === session ? t : { ...t, currentSession: session };
}

// ---- Lanes ----

export function addLane(t: Timeline, name: string, src: IdSource): Timeline {
  const lane = makeLane(src, { kind: "custom", name, characterId: null, sort: nextSort(t.lanes) });
  return { ...t, lanes: [...t.lanes, lane] };
}

export function updateLane(
  t: Timeline,
  id: string,
  patch: Partial<Pick<Lane, "name" | "hidden">>,
  now: string,
): Timeline {
  const lane = t.lanes.find((l) => l.id === id);
  if (!lane || samePatch(lane, patch)) return t;
  return {
    ...t,
    lanes: t.lanes.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now } : l)),
  };
}

/** Swaps a lane with its neighbour in `order` (the lanes as the user sees them). */
export function moveLane(
  t: Timeline,
  order: readonly Lane[],
  id: string,
  delta: -1 | 1,
  now: string,
): Timeline {
  const i = order.findIndex((l) => l.id === id);
  const j = i + delta;
  const a = order[i];
  const b = order[j];
  if (i < 0 || !a || !b) return t;
  const ids = order.map((l) => l.id);
  ids[i] = b.id;
  ids[j] = a.id;
  // Lanes not in `order` keep their place after the listed ones.
  const rest = lanesInOrder(t).filter((l) => !ids.includes(l.id));
  const sorts = new Map([...ids, ...rest.map((l) => l.id)].map((laneId, k) => [laneId, k]));
  return {
    ...t,
    lanes: t.lanes.map((l) => {
      const sort = sorts.get(l.id) ?? l.sort;
      return sort === l.sort ? l : { ...l, sort, updatedAt: now };
    }),
  };
}

/** Removes a custom or personal lane; its events move to the main lane, keeping their places. */
export function removeLane(t: Timeline, id: string, now: string): Timeline {
  const lane = t.lanes.find((l) => l.id === id);
  const main = mainLane(t);
  if (!lane || lane.kind === "main" || !main) return t;
  return {
    ...t,
    lanes: t.lanes.filter((l) => l.id !== id),
    events: t.events.map((e) => (e.laneId === id ? { ...e, laneId: main.id, updatedAt: now } : e)),
  };
}
