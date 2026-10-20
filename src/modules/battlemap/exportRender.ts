// Off-screen rendering of a map (and its legend) into PNG images for VTTs.
import { ru } from "../../shared/i18n/ru";
import type { CellType } from "./domain/cellTypes";
import {
  stripLayout,
  type ExportCellSize,
  type LegendEntries,
  type LegendMode,
} from "./domain/exportLayout";
import { labelCell, outlineSegments, regionLookup, type BattlemapModel } from "./domain/grid";
import { CELL_PX, type View } from "./domain/view";
import {
  buildBaseLayer,
  drawCell,
  drawCells,
  drawGrid,
  drawRegionLabels,
  drawRegionOutlines,
  type RegionOverlay,
} from "./render";

export interface ExportOptions {
  cellPx: ExportCellSize;
  grid: boolean;
  outlines: boolean;
  labels: boolean;
  legend: LegendMode;
}

const LEGEND = {
  background: "#f4f1ea",
  text: "#1a1a1e",
  muted: "#5a5a64",
  font: '"Segoe UI", sans-serif',
};

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}

function flagsText(t: CellType): string {
  const f = ru.battlemap.export.flags;
  const parts: string[] = [];
  if (t.blocksMove) parts.push(f.blocksMove);
  if (t.blocksSight === "yes") parts.push(f.blocksSight);
  if (t.blocksSight === "partial") parts.push(f.partialSight);
  return parts.join(", ");
}

interface LegendRow {
  type: CellType;
  name: string;
  note: string;
}

/** Measures the legend and returns its size together with a function that draws it. */
export function layoutLegend(entries: LegendEntries, title: string, cellPx: number) {
  const row = Math.round(Math.min(64, Math.max(28, cellPx * 0.6)));
  const pad = Math.round(row * 0.5);
  const swatch = Math.round(row * 0.75);
  const nameFont = `600 ${Math.round(row * 0.42)}px ${LEGEND.font}`;
  const noteFont = `${Math.round(row * 0.34)}px ${LEGEND.font}`;
  const titleFont = `700 ${Math.round(row * 0.55)}px ${LEGEND.font}`;
  const headFont = `600 ${Math.round(row * 0.36)}px ${LEGEND.font}`;

  const sections: { heading: string; rows: LegendRow[] }[] = [
    {
      heading: ru.battlemap.export.legendTypes,
      rows: entries.types.map((t) => ({
        type: t,
        name: t.name,
        note: [flagsText(t), t.comment].filter((x) => x !== "").join(" · "),
      })),
    },
  ];
  if (entries.regions.length > 0) {
    sections.push({
      heading: ru.battlemap.export.legendRegions,
      rows: entries.regions.map((r) => ({ type: r.type, name: r.name, note: r.type.name })),
    });
  }

  const measure = context(document.createElement("canvas"));
  const textWidth = (font: string, text: string) => {
    measure.font = font;
    return measure.measureText(text).width;
  };
  let contentWidth = textWidth(titleFont, title);
  let height = pad + row;
  for (const section of sections) {
    contentWidth = Math.max(contentWidth, textWidth(headFont, section.heading));
    height += row * 0.8;
    for (const r of section.rows) {
      const w = Math.max(textWidth(nameFont, r.name), r.note ? textWidth(noteFont, r.note) : 0);
      contentWidth = Math.max(contentWidth, swatch + pad * 0.5 + w);
      height += row;
    }
    height += pad * 0.5;
  }
  const width = Math.ceil(contentWidth + pad * 2);
  height = Math.ceil(height + pad * 0.5);

  function draw(ctx: CanvasRenderingContext2D, x: number, y: number, fillHeight = height) {
    ctx.fillStyle = LEGEND.background;
    ctx.fillRect(x, y, width, fillHeight);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let cy = y + pad;
    ctx.fillStyle = LEGEND.text;
    ctx.font = titleFont;
    ctx.fillText(title, x + pad, cy + row * 0.4);
    cy += row;
    for (const section of sections) {
      ctx.fillStyle = LEGEND.muted;
      ctx.font = headFont;
      ctx.fillText(section.heading.toUpperCase(), x + pad, cy + row * 0.4);
      cy += row * 0.8;
      for (const r of section.rows) {
        const sy = cy + (row - swatch) / 2;
        drawCell(ctx, r.type, x + pad, sy, swatch);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad + 0.5, sy + 0.5, swatch - 1, swatch - 1);
        const tx = x + pad + swatch + pad * 0.5;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = LEGEND.text;
        ctx.font = nameFont;
        if (r.note) {
          ctx.fillText(r.name, tx, cy + row * 0.32);
          ctx.fillStyle = LEGEND.muted;
          ctx.font = noteFont;
          ctx.fillText(r.note, tx, cy + row * 0.72);
        } else {
          ctx.fillText(r.name, tx, cy + row / 2);
        }
        cy += row;
      }
      cy += pad * 0.5;
    }
  }

  return { width, height, draw };
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  model: BattlemapModel,
  typeOf: (id: string) => CellType,
  options: ExportOptions,
) {
  const px = options.cellPx;
  const view: View = { x: 0, y: 0, zoom: px / CELL_PX };
  const range = { x0: 0, y0: 0, x1: model.width - 1, y1: model.height - 1 };
  const lookup = regionLookup(model);
  drawCells(ctx, model, lookup, buildBaseLayer(model, lookup, typeOf), typeOf, view, range);
  if (options.grid) drawGrid(ctx, view, range, px >= 100 ? 2 : 1);
  const overlays: RegionOverlay[] = model.regions.map((r) => ({
    id: r.id,
    name: r.name,
    segments: options.outlines ? outlineSegments(r.cells, model.width) : [],
    labelCell: options.labels && r.labelVisible ? labelCell(r.cells, model.width) : null,
  }));
  if (options.outlines) drawRegionOutlines(ctx, overlays, view, Math.round(px / 24) + 1);
  if (options.labels) {
    const bounds = { width: model.width * px, height: model.height * px };
    drawRegionLabels(ctx, overlays, model.width, view, Math.max(11, Math.round(px * 0.32)), bounds);
  }
}

/** Size of the map image in cells (the legend strip adds whole cells on the right). */
export function mapImageSize(
  model: BattlemapModel,
  options: ExportOptions,
  legend: ReturnType<typeof layoutLegend> | null,
) {
  if (options.legend === "strip" && legend) {
    const layout = stripLayout(model, options.cellPx, legend);
    return { widthCells: layout.widthCells, heightCells: layout.heightCells, layout };
  }
  return { widthCells: model.width, heightCells: model.height, layout: null };
}

export function renderMapImage(
  model: BattlemapModel,
  typeOf: (id: string) => CellType,
  options: ExportOptions,
  legend: ReturnType<typeof layoutLegend> | null,
): HTMLCanvasElement {
  const px = options.cellPx;
  const size = mapImageSize(model, options, legend);
  const canvas = document.createElement("canvas");
  canvas.width = size.widthCells * px;
  canvas.height = size.heightCells * px;
  const ctx = context(canvas);
  if (size.layout && legend) {
    // Fill the area below a short map so the image is not transparent there.
    ctx.fillStyle = LEGEND.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    legend.draw(ctx, size.layout.stripX, 0, canvas.height);
  }
  drawMap(ctx, model, typeOf, options);
  return canvas;
}

export function renderLegendImage(legend: ReturnType<typeof layoutLegend>): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = legend.width;
  canvas.height = legend.height;
  legend.draw(context(canvas), 0, 0);
  return canvas;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
}
