import { FLOOR, WALL } from "./cellTypes";
import type { MapObject } from "./objects";

export const MIN_SIZE = 5;
export const MAX_SIZE = 200;

export interface Region {
  id: string;
  name: string;
  /**
   * Cell type applied to every cell of the region, overriding the cells' own types;
   * null keeps the own types (the region only names an area).
   */
  typeId: string | null;
  note: string;
  labelVisible: boolean;
  /** Cell indices (y * width + x), ascending, without duplicates. */
  cells: readonly number[];
}

/**
 * Immutable map model. Cells store indices into `palette` (cell type ids) so that
 * undo snapshots of a 200×200 map stay small. Every edit returns a new model.
 */
export interface BattlemapModel {
  width: number;
  height: number;
  palette: readonly string[];
  cells: Uint16Array;
  regions: readonly Region[];
  /** Placed objects in drawing order (last on top). */
  objects: readonly MapObject[];
}

export interface Point {
  x: number;
  y: number;
}

export function isValidSize(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE;
}

export function createModel(
  width: number,
  height: number,
  options: { perimeter?: boolean } = {},
): BattlemapModel {
  if (!isValidSize(width) || !isValidSize(height)) {
    throw new Error(`Map size must be ${MIN_SIZE}..${MAX_SIZE}, got ${width}×${height}`);
  }
  const cells = new Uint16Array(width * height);
  if (options.perimeter) {
    for (let x = 0; x < width; x++) {
      cells[x] = 1;
      cells[(height - 1) * width + x] = 1;
    }
    for (let y = 0; y < height; y++) {
      cells[y * width] = 1;
      cells[y * width + width - 1] = 1;
    }
  }
  return { width, height, palette: [FLOOR, WALL], cells, regions: [], objects: [] };
}

export function cellIndex(m: { width: number }, x: number, y: number): number {
  return y * m.width + x;
}

export function cellPoint(m: { width: number }, index: number): Point {
  return { x: index % m.width, y: Math.floor(index / m.width) };
}

export function inBounds(m: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

/** The cell's own type, ignoring regions. */
export function cellTypeAt(m: BattlemapModel, index: number): string {
  return m.palette[m.cells[index] ?? 0] ?? FLOOR;
}

/** cell index → index in `m.regions`, or -1. */
export function regionLookup(m: BattlemapModel): Int32Array {
  const lookup = new Int32Array(m.width * m.height).fill(-1);
  m.regions.forEach((r, ri) => {
    for (const c of r.cells) lookup[c] = ri;
  });
  return lookup;
}

/** The visible type: the region's type when the cell belongs to one. */
export function effectiveTypeAt(m: BattlemapModel, lookup: Int32Array, index: number): string {
  const ri = lookup[index] ?? -1;
  const region = ri >= 0 ? m.regions[ri] : undefined;
  return region?.typeId ?? cellTypeAt(m, index);
}

/** Sets the own type of the given cells. Returns `m` itself when nothing changes. */
export function paintCells(
  m: BattlemapModel,
  cells: Iterable<number>,
  typeId: string,
): BattlemapModel {
  let palette = m.palette;
  let code = palette.indexOf(typeId);
  let next: Uint16Array | null = null;
  for (const c of cells) {
    if (c < 0 || c >= m.cells.length) continue;
    if (code < 0) {
      palette = [...palette, typeId];
      code = palette.length - 1;
    }
    if ((next ?? m.cells)[c] === code) continue;
    next ??= m.cells.slice();
    next[c] = code;
  }
  return next ? { ...m, palette, cells: next } : m;
}

/** Indices of the rectangle spanned by two corners (inclusive), clipped to the map. */
export function rectCells(m: { width: number; height: number }, a: Point, b: Point): number[] {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(m.width - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(m.height - 1, Math.max(a.y, b.y));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out.push(y * m.width + x);
  }
  return out;
}

/** Cells on the straight line between two points, so fast brush strokes leave no gaps. */
export function lineCells(m: { width: number; height: number }, a: Point, b: Point): number[] {
  const out: number[] = [];
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    if (inBounds(m, x, y)) out.push(y * m.width + x);
  }
  return out;
}

function neighbours(width: number, height: number, c: number): number[] {
  const x = c % width;
  const out: number[] = [];
  if (x > 0) out.push(c - 1);
  if (x < width - 1) out.push(c + 1);
  if (c >= width) out.push(c - width);
  if (c < width * (height - 1)) out.push(c + width);
  return out;
}

/** The 4-connected area of cells that share the start cell's own type. */
export function floodCells(m: BattlemapModel, start: number): number[] {
  const code = m.cells[start];
  if (code === undefined) return [];
  const seen = new Uint8Array(m.cells.length);
  const stack = [start];
  const out: number[] = [];
  seen[start] = 1;
  while (stack.length > 0) {
    const c = stack.pop() as number;
    out.push(c);
    for (const n of neighbours(m.width, m.height, c)) {
      if (!seen[n] && m.cells[n] === code) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return out.sort((a, b) => a - b);
}

/** True when the cells form one 4-connected group (an empty set counts as connected). */
export function isConnected(cells: readonly number[], width: number): boolean {
  const first = cells[0];
  if (first === undefined) return true;
  const set = new Set(cells);
  const seen = new Set([first]);
  const stack = [first];
  while (stack.length > 0) {
    const c = stack.pop() as number;
    const x = c % width;
    const candidates = [c - width, c + width];
    if (x > 0) candidates.push(c - 1);
    if (x < width - 1) candidates.push(c + 1);
    for (const n of candidates) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === set.size;
}

function normalizeCells(m: BattlemapModel, cells: Iterable<number>): number[] {
  const max = m.width * m.height;
  return [...new Set(cells)]
    .filter((c) => Number.isInteger(c) && c >= 0 && c < max)
    .sort((a, b) => a - b);
}

/**
 * Puts the cells into region `id` (which must exist), taking them out of any other
 * region: a cell belongs to at most one region. Regions left empty are removed.
 */
function claimCells(m: BattlemapModel, id: string, cells: readonly number[]): BattlemapModel {
  const claimed = new Set(cells);
  const regions: Region[] = [];
  for (const r of m.regions) {
    if (r.id === id) {
      regions.push({ ...r, cells: normalizeCells(m, [...r.cells, ...cells]) });
      continue;
    }
    const rest = r.cells.filter((c) => !claimed.has(c));
    if (rest.length === r.cells.length) regions.push(r);
    else if (rest.length > 0) regions.push({ ...r, cells: rest });
  }
  return { ...m, regions };
}

export type RegionProps = Pick<Region, "name" | "typeId" | "note" | "labelVisible">;

export function addRegion(
  m: BattlemapModel,
  id: string,
  props: RegionProps,
  cells: Iterable<number>,
): BattlemapModel {
  const list = normalizeCells(m, cells);
  if (list.length === 0) return m;
  if (m.regions.some((r) => r.id === id)) throw new Error(`Region ${id} already exists`);
  const withRegion = { ...m, regions: [...m.regions, { id, ...props, cells: [] }] };
  return claimCells(withRegion, id, list);
}

export function updateRegion(
  m: BattlemapModel,
  id: string,
  patch: Partial<RegionProps>,
): BattlemapModel {
  return { ...m, regions: m.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function addCellsToRegion(
  m: BattlemapModel,
  id: string,
  cells: Iterable<number>,
): BattlemapModel {
  if (!m.regions.some((r) => r.id === id)) return m;
  return claimCells(m, id, normalizeCells(m, cells));
}

/** Removes cells from the region; a region left without cells is deleted. */
export function removeCellsFromRegion(
  m: BattlemapModel,
  id: string,
  cells: Iterable<number>,
): BattlemapModel {
  const drop = new Set(cells);
  const regions: Region[] = [];
  for (const r of m.regions) {
    if (r.id !== id) {
      regions.push(r);
      continue;
    }
    const rest = r.cells.filter((c) => !drop.has(c));
    if (rest.length > 0) regions.push({ ...r, cells: rest });
  }
  return { ...m, regions };
}

/** Deletes the region; its cells show their own types again. */
export function deleteRegion(m: BattlemapModel, id: string): BattlemapModel {
  return { ...m, regions: m.regions.filter((r) => r.id !== id) };
}

/** Removes the cells from whatever regions contain them. */
export function releaseCells(m: BattlemapModel, cells: Iterable<number>): BattlemapModel {
  const drop = new Set(cells);
  if (!m.regions.some((r) => r.cells.some((c) => drop.has(c)))) return m;
  const regions = m.regions
    .map((r) => ({ ...r, cells: r.cells.filter((c) => !drop.has(c)) }))
    .filter((r) => r.cells.length > 0);
  return { ...m, regions };
}

/** Line segment in cell units: [x1, y1, x2, y2]. */
export type Segment = readonly [number, number, number, number];

/** Border of a cell set: every cell edge that is not shared with another cell of the set. */
export function outlineSegments(cells: readonly number[], width: number): Segment[] {
  const set = new Set(cells);
  const out: Segment[] = [];
  for (const c of cells) {
    const x = c % width;
    const y = (c - x) / width;
    if (!set.has(c - width)) out.push([x, y, x + 1, y]);
    if (!set.has(c + width)) out.push([x, y + 1, x + 1, y + 1]);
    if (x === 0 || !set.has(c - 1)) out.push([x, y, x, y + 1]);
    if (x === width - 1 || !set.has(c + 1)) out.push([x + 1, y, x + 1, y + 1]);
  }
  return out;
}

/** Cell where the label goes: the region's cell nearest to its centroid. */
export function labelCell(cells: readonly number[], width: number): number | null {
  if (cells.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c % width;
    sy += Math.floor(c / width);
  }
  const cx = sx / cells.length;
  const cy = sy / cells.length;
  let best = cells[0] ?? null;
  let bestDist = Infinity;
  for (const c of cells) {
    const d = ((c % width) - cx) ** 2 + (Math.floor(c / width) - cy) ** 2;
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Cells to add (positive) or crop (negative) on each side. */
export interface ResizeDelta {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function resizedSize(m: { width: number; height: number }, d: ResizeDelta) {
  return { width: m.width + d.left + d.right, height: m.height + d.top + d.bottom };
}

/**
 * Grows or crops the map; new cells are floor, cropped cells leave their regions.
 * Objects move with their top-left cell and are dropped when that cell is cropped.
 */
export function resizeModel(m: BattlemapModel, d: ResizeDelta): BattlemapModel {
  const { width, height } = resizedSize(m, d);
  if (!isValidSize(width) || !isValidSize(height)) {
    throw new Error(`Map size must be ${MIN_SIZE}..${MAX_SIZE}, got ${width}×${height}`);
  }
  let palette = m.palette;
  let floorCode = palette.indexOf(FLOOR);
  if (floorCode < 0) {
    palette = [...palette, FLOOR];
    floorCode = palette.length - 1;
  }
  const cells = new Uint16Array(width * height).fill(floorCode);
  const remap = (c: number) => remapIndex(m, d, c);
  for (let c = 0; c < m.cells.length; c++) {
    const n = remap(c);
    if (n >= 0) cells[n] = m.cells[c] ?? floorCode;
  }
  const regions = m.regions
    .map((r) => ({
      ...r,
      cells: r.cells
        .map(remap)
        .filter((c) => c >= 0)
        .sort((a, b) => a - b),
    }))
    .filter((r) => r.cells.length > 0);
  const objects = m.objects
    .map((o) => ({ ...o, x: o.x + d.left, y: o.y + d.top }))
    .filter((o) => inBounds({ width, height }, o.x, o.y));
  return { width, height, palette, cells, regions, objects };
}

/** Moves a cell index of the old map to the resized one, or -1 when cropped. */
export function remapIndex(
  m: { width: number; height: number },
  d: ResizeDelta,
  index: number,
): number {
  const { width, height } = resizedSize(m, d);
  const x = (index % m.width) + d.left;
  const y = Math.floor(index / m.width) + d.top;
  return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : -1;
}
