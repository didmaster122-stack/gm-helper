// Small gallery picture of a map, stored with the map as a data URL.
import type { CellType } from "./domain/cellTypes";
import { regionLookup, type BattlemapModel } from "./domain/grid";
import { CELL_PX, type View } from "./domain/view";
import { buildBaseLayer, drawCells, drawGrid, drawObjects, type ObjectDefOf } from "./render";

export const PREVIEW_SIDE = 320;

export function renderPreview(
  model: BattlemapModel,
  typeOf: (id: string) => CellType,
  defOf: ObjectDefOf,
): string {
  // Whole pixels per cell keep the cells crisp; a 200-cell side gets one pixel each.
  const px = Math.max(1, Math.floor(PREVIEW_SIDE / Math.max(model.width, model.height)));
  const canvas = document.createElement("canvas");
  canvas.width = model.width * px;
  canvas.height = model.height * px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const view: View = { x: 0, y: 0, zoom: px / CELL_PX };
  const range = { x0: 0, y0: 0, x1: model.width - 1, y1: model.height - 1 };
  const lookup = regionLookup(model);
  drawCells(ctx, model, lookup, buildBaseLayer(model, lookup, typeOf), typeOf, view, range);
  if (px >= 6) drawGrid(ctx, view, range);
  drawObjects(ctx, model.objects, defOf, view);
  return canvas.toDataURL("image/webp", 0.8);
}
