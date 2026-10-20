import { sessionItems } from "./timeline";
import type { Lane, MarkerLevel, Timeline } from "./types";

// Vertical timeline in screen pixels. Sessions go top to bottom ("Future" last);
// session brackets (left), lane names (top) and the in-game time axis (right)
// stay in place while scrolling. Every event and shown marker takes its own
// slot, so the order from top to bottom is the order of the story.
//
// Coordinates of cards, bands and markers are relative to the lane area
// (below the header, between the side gutters).

export const HEADER_H = 36;
export const SESSIONS_W = 120;
export const MARKERS_W = 200;
export const MIN_COL_W = 180;
export const COL_PAD = 12;
/** Distance of the time axis from the left edge of the time gutter. */
export const AXIS_OFFSET = 18;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

/** How much of a card is shown: full card, one line, or a thin bar. */
export type Detail = "full" | "compact" | "bar";

const CARD_H: Record<Detail, number> = { full: 62, compact: 32, bar: 18 };

export function detailAt(zoom: number): Detail {
  if (zoom >= 0.85) return "full";
  if (zoom >= 0.5) return "compact";
  return "bar";
}

/** Which markers are shown at a zoom: the finer ones only when zoomed in. */
export function markerVisible(level: MarkerLevel, zoom: number): boolean {
  if (level === 1) return true;
  if (level === 2) return zoom >= 0.55;
  return zoom >= 0.9;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export interface Column {
  lane: Lane;
  x: number;
  width: number;
}

export interface Band {
  /** Session number; null is "Future". */
  session: number | null;
  y: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Slot {
  id: string;
  kind: "event" | "marker";
  top: number;
  bottom: number;
}

export interface TimelineLayout {
  zoom: number;
  detail: Detail;
  columns: Column[];
  bands: Band[];
  cards: Map<string, Box>;
  /** Vertical middle of each shown marker. */
  markers: Map<string, number>;
  /** Shown items of each band in their order, by band index. */
  slots: Slot[][];
  /** Size of the lane area. */
  lanesWidth: number;
  height: number;
}

export function sessionList(sessionCount: number): (number | null)[] {
  return [...Array.from({ length: sessionCount }, (_, i) => i + 1), null];
}

export interface LayoutOptions {
  /** Width of the visible area, gutters included. */
  viewWidth: number;
  zoom: number;
}

/** Size of text and cards relative to normal: zooming in makes them bigger. */
export function textScale(zoom: number): number {
  return Math.max(1, clampZoom(zoom));
}

/**
 * Lays out the timeline. The lanes always fill the visible width (never less
 * than their minimum width): zooming changes only the vertical spacing and the
 * size and detail of the cards. Only events in `shownEvents` and lanes in
 * `lanes` are placed.
 */
export function layoutTimeline(
  t: Timeline,
  lanes: readonly Lane[],
  shownEvents: ReadonlySet<string>,
  { viewWidth, zoom }: LayoutOptions,
): TimelineLayout {
  const z = clampZoom(zoom);
  const detail = detailAt(z);
  const lanesWidth = Math.floor(
    Math.max(viewWidth - SESSIONS_W - MARKERS_W, lanes.length * MIN_COL_W, MIN_COL_W),
  );
  const colW = lanesWidth / Math.max(lanes.length, 1);
  const cardW = Math.max(colW - 2 * COL_PAD, 40);
  const cardH = Math.round(CARD_H[detail] * textScale(z));
  const gap = Math.max(4, Math.round(10 * z));
  const pad = Math.max(6, Math.round(12 * z));
  const markerH = z >= 0.55 ? 24 : 20;

  const columns = lanes.map((lane, i) => ({ lane, x: i * colW, width: colW }));
  const columnOf = new Map(columns.map((c) => [c.lane.id, c]));
  const laneOf = new Map(t.events.map((e) => [e.id, e.laneId]));
  const levelOf = new Map(t.markers.map((m) => [m.id, m.level]));

  const bands: Band[] = [];
  const cards = new Map<string, Box>();
  const markers = new Map<string, number>();
  const slots: Slot[][] = [];
  let y = 0;
  for (const session of sessionList(t.sessionCount)) {
    const top = y;
    const list: Slot[] = [];
    y += pad;
    for (const item of sessionItems(t, session)) {
      if (item.kind === "marker") {
        const level = levelOf.get(item.id);
        if (level === undefined || !markerVisible(level, z)) continue;
        markers.set(item.id, y + markerH / 2);
        list.push({ ...item, top: y, bottom: y + markerH });
        y += markerH + gap;
        continue;
      }
      const col = columnOf.get(laneOf.get(item.id) ?? "");
      if (!col || !shownEvents.has(item.id)) continue;
      cards.set(item.id, { x: col.x + (col.width - cardW) / 2, y, width: cardW, height: cardH });
      list.push({ ...item, top: y, bottom: y + cardH });
      y += cardH + gap;
    }
    // An empty session still has room for one card, to drop or create one.
    y = Math.max(list.length > 0 ? y - gap : y, top + pad + cardH) + pad;
    bands.push({ session, y: top, height: y - top });
    slots.push(list);
  }
  return { zoom: z, detail, columns, bands, cards, markers, slots, lanesWidth, height: y };
}

export interface Place {
  session: number | null;
  /** Shown item to insert before; null puts the new item at the end of the session. */
  beforeId: string | null;
  /** Lane under the point (the nearest one at the sides). */
  laneId: string | null;
}

function bandIndexAt(layout: TimelineLayout, y: number): number {
  const index = layout.bands.findIndex((b) => y < b.y + b.height);
  return index < 0 ? layout.bands.length - 1 : index;
}

/** Where an item put at (x, y) of the lane area goes; `ignoreId` is the item being dragged. */
export function placeAt(
  layout: TimelineLayout,
  x: number,
  y: number,
  ignoreId: string | null = null,
): Place | null {
  const index = bandIndexAt(layout, y);
  const band = layout.bands[index];
  if (!band) return null;
  const before = (layout.slots[index] ?? []).find(
    (s) => s.id !== ignoreId && (s.top + s.bottom) / 2 > y,
  );
  let column = layout.columns[0];
  for (const c of layout.columns) if (x >= c.x) column = c;
  return { session: band.session, beforeId: before?.id ?? null, laneId: column?.lane.id ?? null };
}

/** Height of the line that shows where an item of `place` will be put. */
export function insertY(layout: TimelineLayout, place: Place, ignoreId: string | null): number {
  const index = layout.bands.findIndex((b) => b.session === place.session);
  const band = layout.bands[index];
  if (!band) return 0;
  const slots = (layout.slots[index] ?? []).filter((s) => s.id !== ignoreId);
  const before = slots.find((s) => s.id === place.beforeId);
  if (before) return before.top - 3;
  const last = slots[slots.length - 1];
  return last ? last.bottom + 3 : band.y + 6;
}

/** Card under a point of the lane area. */
export function cardAt(layout: TimelineLayout, x: number, y: number): string | null {
  for (const [id, b] of layout.cards) {
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return id;
  }
  return null;
}

/** What stays under the pointer while zooming: an item (or a session) and a point inside it. */
export interface Anchor {
  id: string;
  /** Position inside the item, 0 (top) to 1 (bottom). */
  fraction: number;
}

function bandKey(session: number | null): string {
  return `session:${session ?? "future"}`;
}

export function anchorAt(layout: TimelineLayout, y: number): Anchor | null {
  const index = bandIndexAt(layout, y);
  const band = layout.bands[index];
  if (!band) return null;
  const slot = (layout.slots[index] ?? []).find((s) => y >= s.top && y < s.bottom);
  const [id, top, height] = slot
    ? [slot.id, slot.top, slot.bottom - slot.top]
    : [bandKey(band.session), band.y, band.height];
  return { id, fraction: Math.min(1, Math.max(0, (y - top) / height)) };
}

/** Where an anchor is in another layout of the same timeline. */
export function anchorY(layout: TimelineLayout, anchor: Anchor): number | null {
  for (const [i, band] of layout.bands.entries()) {
    if (bandKey(band.session) === anchor.id) return band.y + anchor.fraction * band.height;
    const slot = layout.slots[i]?.find((s) => s.id === anchor.id);
    if (slot) return slot.top + anchor.fraction * (slot.bottom - slot.top);
  }
  return null;
}

/** SVG path of an arrow from the bottom of `from` to the top of `to`. */
export function linkPath(from: Box, to: Box): string {
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height;
  const ex = to.x + to.width / 2;
  const ey = to.y;
  const bend = Math.max(30, Math.abs(ey - sy) / 2);
  return `M ${sx} ${sy} C ${sx} ${sy + bend}, ${ex} ${ey - bend}, ${ex} ${ey}`;
}
