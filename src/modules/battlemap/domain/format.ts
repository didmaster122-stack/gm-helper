import { FLOOR } from "./cellTypes";
import { isValidSize, type BattlemapModel, type Region } from "./grid";

export const FORMAT_VERSION = 1;

/**
 * Stored map, also the base of the `.gmmap.json` file. `cells` is run-length encoded:
 * pairs of [palette index, run length] in row-major order.
 */
export interface BattlemapJsonV1 {
  version: 1;
  width: number;
  height: number;
  palette: string[];
  cells: number[];
  regions: Region[];
}

export type BattlemapJson = BattlemapJsonV1;

export function toJson(m: BattlemapModel): BattlemapJson {
  // Drop palette entries no cell uses any more.
  const used = new Map<number, number>();
  const palette: string[] = [];
  const cells: number[] = [];
  let run = -1;
  let count = 0;
  for (const code of m.cells) {
    let mapped = used.get(code);
    if (mapped === undefined) {
      mapped = palette.length;
      used.set(code, mapped);
      palette.push(m.palette[code] ?? FLOOR);
    }
    if (mapped === run) {
      count++;
    } else {
      if (count > 0) cells.push(run, count);
      run = mapped;
      count = 1;
    }
  }
  if (count > 0) cells.push(run, count);
  return {
    version: FORMAT_VERSION,
    width: m.width,
    height: m.height,
    palette,
    cells,
    regions: m.regions.map((r) => ({ ...r, cells: [...r.cells] })),
  };
}

function fail(reason: string): never {
  throw new Error(`Invalid battlemap: ${reason}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function parseRegion(raw: unknown, cellCount: number, taken: Set<number>): Region {
  if (!isRecord(raw)) fail("region is not an object");
  const { id, name, typeId, note, labelVisible, cells } = raw;
  if (typeof id !== "string" || id === "") fail("region id");
  if (typeof name !== "string") fail("region name");
  if (typeof typeId !== "string" || typeId === "") fail("region type");
  if (!Array.isArray(cells)) fail("region cells");
  // Enforce "one region per cell" even for hand-edited files: later regions lose duplicates.
  const list = [...new Set(cells)]
    .filter((c): c is number => isNonNegInt(c) && c < cellCount && !taken.has(c))
    .sort((a, b) => a - b);
  for (const c of list) taken.add(c);
  return {
    id,
    name,
    typeId,
    note: typeof note === "string" ? note : "",
    labelVisible: labelVisible !== false,
    cells: list,
  };
}

/** Parses stored JSON (any known version) into a model. Throws on malformed data. */
export function fromJson(raw: unknown): BattlemapModel {
  if (!isRecord(raw)) fail("not an object");
  if (raw.version !== 1) fail(`unsupported version ${String(raw.version)}`);
  const { width, height, palette, cells, regions } = raw;
  if (typeof width !== "number" || !isValidSize(width)) fail("width");
  if (typeof height !== "number" || !isValidSize(height)) fail("height");
  if (!Array.isArray(palette) || palette.length === 0) fail("palette");
  if (!palette.every((p) => typeof p === "string" && p !== "")) fail("palette entry");
  if (!Array.isArray(cells) || cells.length % 2 !== 0) fail("cells");

  const total = width * height;
  const out = new Uint16Array(total);
  let pos = 0;
  for (let i = 0; i < cells.length; i += 2) {
    const code = cells[i] as unknown;
    const count = cells[i + 1] as unknown;
    if (!isNonNegInt(code) || code >= palette.length) fail("cell type index");
    if (!isNonNegInt(count) || count === 0 || pos + count > total) fail("cell run");
    out.fill(code, pos, pos + count);
    pos += count;
  }
  if (pos !== total) fail("cell count");

  if (!Array.isArray(regions)) fail("regions");
  const taken = new Set<number>();
  const parsed = regions.map((r) => parseRegion(r, total, taken)).filter((r) => r.cells.length > 0);
  if (new Set(parsed.map((r) => r.id)).size !== parsed.length) fail("duplicate region id");

  return { width, height, palette: palette as string[], cells: out, regions: parsed };
}
