import type { CellSymbol } from "./cellTypes";
import type { BattlemapModel } from "./grid";

export const MIN_OBJECT_SIZE = 1;
export const MAX_OBJECT_SIZE = 10;

/** Catalog entry (app-wide, like custom cell types): e.g. "Стол" 2×1. */
export interface ObjectDef {
  id: string;
  name: string;
  /** Size in cells before rotation. */
  width: number;
  height: number;
  /** Background colour of the footprint. */
  color: string;
  symbol: CellSymbol | null;
  blocksMove: boolean;
  blocksSight: boolean;
}

export type Rotation = 0 | 90 | 180 | 270;
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** An object placed on a map. Objects are drawn over cells and never change their types. */
export interface MapObject {
  id: string;
  defId: string;
  /** Top-left cell of the rotated footprint. */
  x: number;
  y: number;
  rotation: Rotation;
}

/** Size of a catalog object, or null when it was deleted from the catalog. */
export type ObjectSizeOf = (defId: string) => { width: number; height: number } | null;

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isValidObjectSize(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_OBJECT_SIZE && n <= MAX_OBJECT_SIZE;
}

export function isRotation(value: unknown): value is Rotation {
  return (ROTATIONS as readonly unknown[]).includes(value);
}

export function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

/** Footprint in cells; a quarter turn swaps the sides. Deleted objects take one cell. */
export function footprint(
  size: { width: number; height: number } | null,
  rotation: Rotation,
): { w: number; h: number } {
  if (!size) return { w: 1, h: 1 };
  return rotation % 180 === 0
    ? { w: size.width, h: size.height }
    : { w: size.height, h: size.width };
}

export function objectRect(o: MapObject, sizeOf: ObjectSizeOf): CellRect {
  return { x: o.x, y: o.y, ...footprint(sizeOf(o.defId), o.rotation) };
}

/** Moves the top-left corner so the footprint stays on the map (when it fits at all). */
export function clampPosition(
  m: { width: number; height: number },
  x: number,
  y: number,
  size: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, m.width - size.w)),
    y: Math.max(0, Math.min(y, m.height - size.h)),
  };
}

/** The topmost object covering the cell (objects later in the list are drawn on top). */
export function objectAt(
  m: BattlemapModel,
  sizeOf: ObjectSizeOf,
  x: number,
  y: number,
): MapObject | null {
  for (let i = m.objects.length - 1; i >= 0; i--) {
    const o = m.objects[i];
    if (!o) continue;
    const r = objectRect(o, sizeOf);
    if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return o;
  }
  return null;
}

export function addObject(
  m: BattlemapModel,
  sizeOf: ObjectSizeOf,
  object: MapObject,
): BattlemapModel {
  if (m.objects.some((o) => o.id === object.id)) throw new Error(`Object ${object.id} exists`);
  const pos = clampPosition(
    m,
    object.x,
    object.y,
    footprint(sizeOf(object.defId), object.rotation),
  );
  return { ...m, objects: [...m.objects, { ...object, ...pos }] };
}

/** Shifts the objects by whole cells; each one stays on the map. */
export function moveObjects(
  m: BattlemapModel,
  sizeOf: ObjectSizeOf,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): BattlemapModel {
  if (dx === 0 && dy === 0) return m;
  let changed = false;
  const objects = m.objects.map((o) => {
    if (!ids.has(o.id)) return o;
    const pos = clampPosition(m, o.x + dx, o.y + dy, footprint(sizeOf(o.defId), o.rotation));
    if (pos.x === o.x && pos.y === o.y) return o;
    changed = true;
    return { ...o, ...pos };
  });
  return changed ? { ...m, objects } : m;
}

/** Turns the objects a quarter clockwise around their top-left cell. */
export function rotateObjects(
  m: BattlemapModel,
  sizeOf: ObjectSizeOf,
  ids: ReadonlySet<string>,
): BattlemapModel {
  if (!m.objects.some((o) => ids.has(o.id))) return m;
  const objects = m.objects.map((o) => {
    if (!ids.has(o.id)) return o;
    const rotation = nextRotation(o.rotation);
    return { ...o, rotation, ...clampPosition(m, o.x, o.y, footprint(sizeOf(o.defId), rotation)) };
  });
  return { ...m, objects };
}

export function removeObjects(m: BattlemapModel, ids: ReadonlySet<string>): BattlemapModel {
  const objects = m.objects.filter((o) => !ids.has(o.id));
  return objects.length === m.objects.length ? m : { ...m, objects };
}

/** Catalog ids used on the map, in order of first appearance. */
export function usedObjectDefs(m: { objects: readonly MapObject[] }): string[] {
  return [...new Set(m.objects.map((o) => o.defId))];
}
