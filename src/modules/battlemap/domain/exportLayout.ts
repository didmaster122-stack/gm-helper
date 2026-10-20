import type { CellType } from "./cellTypes";
import { effectiveTypeAt, regionLookup, type BattlemapModel } from "./grid";

export const EXPORT_CELL_SIZES = [24, 70, 100, 140] as const;
export type ExportCellSize = (typeof EXPORT_CELL_SIZES)[number];
export const DEFAULT_EXPORT_CELL: ExportCellSize = 70;

export type LegendMode = "none" | "strip" | "separate";

/** WebView2 (Chromium) refuses larger canvases; big ones also take a lot of memory. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 200_000_000;

export function fitsCanvas(width: number, height: number): boolean {
  return width <= MAX_CANVAS_SIDE && height <= MAX_CANVAS_SIDE && width * height <= MAX_CANVAS_AREA;
}

/** Windows-safe file name part; falls back to "map". */
export function safeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned === "" ? "map" : cleaned;
}

/** `Склеп_30x20_70px.png`: the size in cells lets the user set up the VTT grid. */
export function pngFileName(name: string, widthCells: number, heightCells: number, px: number) {
  return `${safeFileName(name)}_${widthCells}x${heightCells}_${px}px.png`;
}

export function legendFileName(name: string, suffix: string): string {
  return `${safeFileName(name)}_${suffix}.png`;
}

export function gmmapFileName(name: string): string {
  return `${safeFileName(name)}.gmmap.json`;
}

export interface LegendEntries {
  /** Cell types visible on the map, in the order of the type list. */
  types: CellType[];
  regions: { name: string; type: CellType }[];
}

export function legendEntries(
  model: BattlemapModel,
  types: readonly CellType[],
  typeOf: (id: string) => CellType,
): LegendEntries {
  const lookup = regionLookup(model);
  const used = new Set<string>();
  for (let i = 0; i < model.cells.length; i++)
    used.add(typeOf(effectiveTypeAt(model, lookup, i)).id);
  return {
    types: types.filter((t) => used.has(t.id)),
    regions: model.regions
      .filter((r) => r.name.trim() !== "")
      .map((r) => ({ name: r.name, type: typeOf(r.typeId) })),
  };
}

/** Image size when the legend is a strip on the right: both sides stay multiples of the cell. */
export function stripLayout(
  map: { width: number; height: number },
  px: number,
  legend: { width: number; height: number },
) {
  const stripCells = Math.ceil(legend.width / px);
  const heightCells = Math.max(map.height, Math.ceil(legend.height / px));
  return {
    widthCells: map.width + stripCells,
    heightCells,
    stripX: map.width * px,
    stripWidth: stripCells * px,
  };
}
