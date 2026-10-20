// Sizes and shapes of graph nodes. The CSS of the nodes must match these numbers.
import type { Point } from "./graph";
import type { Character, Faction, Relation } from "./types";

/** Character node: round picture with the name and role under it. */
export const CHARACTER_W = 120;
export const CHARACTER_H = 116;
export const AVATAR_SIZE = 64;
export const AVATAR_TOP = 4;

/** Faction frame: padding around members and the title bar height. */
export const FRAME_PAD = 16;
export const FRAME_HEADER = 30;
/** Size of the frame of a faction without members on the graph. */
export const EMPTY_FRAME_W = 180;
export const EMPTY_FRAME_H = 64;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Shape =
  { kind: "circle"; cx: number; cy: number; r: number } | { kind: "rect"; rect: Rect };

export function avatarCenter(c: Pick<Character, "x" | "y">): Point {
  return { x: c.x + CHARACTER_W / 2, y: c.y + AVATAR_TOP + AVATAR_SIZE / 2 };
}

export function characterShape(c: Pick<Character, "x" | "y">): Shape {
  const { x, y } = avatarCenter(c);
  return { kind: "circle", cx: x, cy: y, r: AVATAR_SIZE / 2 + 2 };
}

export function shapeCenter(shape: Shape): Point {
  return shape.kind === "circle"
    ? { x: shape.cx, y: shape.cy }
    : { x: shape.rect.x + shape.rect.width / 2, y: shape.rect.y + shape.rect.height / 2 };
}

/**
 * Frames of factions around their visible members (characters whose main faction it is).
 * A faction without visible members gets a small frame at its own position.
 */
export function factionFrames(
  factions: readonly Faction[],
  characters: readonly Pick<Character, "x" | "y" | "factionIds">[],
): Map<string, Rect> {
  const bounds = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
  for (const c of characters) {
    const main = c.factionIds[0];
    if (main === undefined) continue;
    const b = bounds.get(main);
    if (b) {
      b.minX = Math.min(b.minX, c.x);
      b.minY = Math.min(b.minY, c.y);
      b.maxX = Math.max(b.maxX, c.x);
      b.maxY = Math.max(b.maxY, c.y);
    } else {
      bounds.set(main, { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y });
    }
  }
  const frames = new Map<string, Rect>();
  for (const f of factions) {
    const b = bounds.get(f.id);
    frames.set(
      f.id,
      b
        ? {
            x: b.minX - FRAME_PAD,
            y: b.minY - FRAME_PAD - FRAME_HEADER,
            width: b.maxX - b.minX + CHARACTER_W + 2 * FRAME_PAD,
            height: b.maxY - b.minY + CHARACTER_H + 2 * FRAME_PAD + FRAME_HEADER,
          }
        : { x: f.x, y: f.y, width: EMPTY_FRAME_W, height: EMPTY_FRAME_H },
    );
  }
  return frames;
}

/** Point where the segment from the shape's centre towards `toward` leaves the shape. */
export function clipToShape(shape: Shape, toward: Point): Point {
  const c = shapeCenter(shape);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return c;
  if (shape.kind === "circle") {
    return { x: c.x + (dx / len) * shape.r, y: c.y + (dy / len) * shape.r };
  }
  const hw = shape.rect.width / 2;
  const hh = shape.rect.height / 2;
  const t = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  return t >= 1 ? toward : { x: c.x + dx * t, y: c.y + dy * t };
}

/** Distance between neighbouring parallel relations of one pair, in graph units. */
export const PARALLEL_GAP = 28;

/**
 * Signed offsets of relations between the same pair of nodes, so several relations
 * of one pair are drawn as separate curves. The sign is relative to the pair's
 * canonical direction (smaller id → larger id), see `relationPath`.
 */
export function parallelOffsets(relations: readonly Relation[]): Map<string, number> {
  const groups = new Map<string, Relation[]>();
  for (const r of relations) {
    const key = r.fromId < r.toId ? `${r.fromId}|${r.toId}` : `${r.toId}|${r.fromId}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const offsets = new Map<string, number>();
  for (const list of groups.values()) {
    list.forEach((r, i) => offsets.set(r.id, (i - (list.length - 1) / 2) * PARALLEL_GAP));
  }
  return offsets;
}

export interface RelationPath {
  /** SVG path (a quadratic curve, or a line when the offset is 0). */
  d: string;
  start: Point;
  end: Point;
  /** Point on the curve halfway between the ends, for the label. */
  label: Point;
}

/** Curve from one node shape to another, bent sideways by `offset`. */
export function relationPath(
  fromId: string,
  from: Shape,
  toId: string,
  to: Shape,
  offset: number,
): RelationPath {
  const a = shapeCenter(from);
  const b = shapeCenter(to);
  // The offset is measured from the canonical direction, so A→B and B→A do not overlap.
  const flip = fromId < toId ? 1 : -1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * offset * flip;
  const ny = (dx / len) * offset * flip;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // The curve passes through mid + n at t = 0.5 when the control point is at mid + 2n.
  const control = { x: mid.x + 2 * nx, y: mid.y + 2 * ny };
  const start = clipToShape(from, offset === 0 ? b : control);
  const end = clipToShape(to, offset === 0 ? a : control);
  const label = { x: mid.x + nx, y: mid.y + ny };
  const d =
    offset === 0
      ? `M ${start.x},${start.y} L ${end.x},${end.y}`
      : `M ${start.x},${start.y} Q ${control.x},${control.y} ${end.x},${end.y}`;
  return { d, start, end, label };
}

/** Bounding box of rectangles; null for none. */
export function unionRects(rects: Iterable<Rect>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A free place for a new node: under everything that is already on the graph. */
export function freeSpot(
  characters: readonly Pick<Character, "x" | "y" | "factionIds">[],
  factions: readonly Faction[],
): Point {
  const rects: Rect[] = [...factionFrames(factions, characters).values()];
  for (const c of characters)
    rects.push({ x: c.x, y: c.y, width: CHARACTER_W, height: CHARACTER_H });
  const box = unionRects(rects);
  return box ? { x: box.x, y: box.y + box.height + 60 } : { x: 0, y: 0 };
}
