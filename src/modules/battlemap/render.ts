// Canvas drawing for the editor. Cell colours go into a 1 px-per-cell bitmap that is
// scaled up in one drawImage call; patterns, icons and overlays are drawn only for the
// visible cells, so a 200×200 map stays fast.
import { contrastColor, type CellIcon, type CellType } from "./domain/cellTypes";
import { effectiveTypeAt, type BattlemapModel, type Segment } from "./domain/grid";
import { cellSize, visibleCells, type View } from "./domain/view";

export const COLORS = {
  background: "#16171c",
  grid: "rgba(0, 0, 0, 0.28)",
  region: "#c9a24a",
  regionActive: "#ffd36b",
  regionFill: "rgba(255, 211, 107, 0.28)",
  selection: "rgba(77, 156, 255, 0.38)",
  selectionLine: "#e8f1ff",
  hover: "rgba(255, 255, 255, 0.8)",
  labelBg: "rgba(22, 23, 28, 0.82)",
  labelText: "#f0e6cc",
};

type TypeOf = (id: string) => CellType;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return Number.isNaN(n) ? [255, 0, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One pixel per cell in its effective colour. */
export function buildBaseLayer(
  model: BattlemapModel,
  lookup: Int32Array,
  typeOf: TypeOf,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = model.width;
  canvas.height = model.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(model.width, model.height);
  const rgb = new Map<string, [number, number, number]>();
  for (let i = 0; i < model.cells.length; i++) {
    const id = effectiveTypeAt(model, lookup, i);
    let c = rgb.get(id);
    if (!c) {
      c = hexToRgb(typeOf(id).color);
      rgb.set(id, c);
    }
    const o = i * 4;
    image.data[o] = c[0];
    image.data[o + 1] = c[1];
    image.data[o + 2] = c[2];
    image.data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: CellIcon, x: number, y: number, s: number) {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.3;
  ctx.beginPath();
  switch (icon) {
    case "door":
      ctx.rect(x + s * 0.3, y + s * 0.15, s * 0.4, s * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.6, cy, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
      return;
    case "square":
      ctx.rect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
      break;
    case "stairs":
      for (let i = 0; i < 4; i++) {
        const yy = y + s * (0.2 + i * 0.2);
        line(ctx, x + s * 0.2, yy, x + s * 0.8, yy);
      }
      break;
    case "circle":
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.8);
      ctx.lineTo(cx - r, cy + r * 0.8);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.45;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case "cross":
      line(ctx, cx - r, cy - r, cx + r, cy + r);
      line(ctx, cx + r, cy - r, cx - r, cy + r);
      break;
  }
  ctx.stroke();
}

/** Pattern and symbol of a type over an already filled cell. */
export function drawCellDecor(
  ctx: CanvasRenderingContext2D,
  type: CellType,
  x: number,
  y: number,
  s: number,
) {
  if (type.pattern === "none" && !type.symbol) return;
  const ink = contrastColor(type.color);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, s / 16);
  ctx.globalAlpha = 0.6;
  switch (type.pattern) {
    case "hatch":
    case "hatch-dense": {
      const n = type.pattern === "hatch" ? 3 : 6;
      ctx.beginPath();
      ctx.rect(x, y, s, s);
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (let i = 1; i < n * 2; i++) {
        const d = (i * s) / n;
        line(ctx, x + d, y, x + d - s, y + s);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "dots": {
      const r = Math.max(0.8, s * 0.06);
      for (const [fx, fy] of [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.5, 0.55],
        [0.3, 0.78],
        [0.7, 0.78],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + s * fx, y + s * fy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "cross":
      ctx.beginPath();
      line(ctx, x + s * 0.15, y + s * 0.15, x + s * 0.85, y + s * 0.85);
      line(ctx, x + s * 0.85, y + s * 0.15, x + s * 0.15, y + s * 0.85);
      ctx.stroke();
      break;
    case "none":
      break;
  }
  ctx.globalAlpha = 0.85;
  if (type.symbol?.kind === "icon") {
    drawIcon(ctx, type.symbol.value, x, y, s);
  } else if (type.symbol?.kind === "letter") {
    ctx.font = `600 ${Math.round(s * 0.6)}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(type.symbol.value, x + s / 2, y + s / 2 + s * 0.03);
  }
  ctx.restore();
}

/** A whole cell (colour and decor); used for palette swatches. */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  type: CellType,
  x: number,
  y: number,
  s: number,
) {
  ctx.fillStyle = type.color;
  ctx.fillRect(x, y, s, s);
  drawCellDecor(ctx, type, x, y, s);
}

/** Pre-rendered decor tiles: drawing thousands of patterns path by path is too slow. */
const decorTiles = new Map<string, HTMLCanvasElement>();
const MAX_TILES = 256;

function decorTile(type: CellType, px: number): HTMLCanvasElement {
  const key = `${type.id}|${type.color}|${type.pattern}|${type.symbol?.value ?? ""}|${px}`;
  let tile = decorTiles.get(key);
  if (!tile) {
    if (decorTiles.size >= MAX_TILES) decorTiles.clear();
    tile = document.createElement("canvas");
    tile.width = px;
    tile.height = px;
    const ctx = tile.getContext("2d");
    if (ctx) drawCellDecor(ctx, type, 0, 0, px);
    decorTiles.set(key, tile);
  }
  return tile;
}

export interface RegionOverlay {
  id: string;
  name: string;
  segments: Segment[];
  /** Cell for the label, or null when the label is hidden. */
  labelCell: number | null;
}

export interface Scene {
  model: BattlemapModel;
  lookup: Int32Array;
  base: HTMLCanvasElement;
  typeOf: TypeOf;
  view: View;
  /** Viewport in CSS pixels. */
  width: number;
  height: number;
  regions: readonly RegionOverlay[];
  activeRegion: { id: string; cells: readonly number[] } | null;
  selection: ReadonlySet<number>;
  selectionOutline: readonly Segment[];
  /** Cells to preview with the given colour (rectangle tool). */
  preview: { cells: readonly number[]; color: string } | null;
  /** Selection frame in cells (inclusive). */
  frame: { x0: number; y0: number; x1: number; y1: number } | null;
  hover: { x: number; y: number } | null;
}

function strokeSegments(
  ctx: CanvasRenderingContext2D,
  segments: readonly Segment[],
  view: View,
  s: number,
) {
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segments) {
    line(ctx, view.x + x1 * s, view.y + y1 * s, view.x + x2 * s, view.y + y2 * s);
  }
  ctx.stroke();
}

function fillCells(
  ctx: CanvasRenderingContext2D,
  cells: Iterable<number>,
  width: number,
  view: View,
  s: number,
) {
  ctx.beginPath();
  for (const c of cells) {
    const x = c % width;
    ctx.rect(view.x + x * s, view.y + ((c - x) / width) * s, s, s);
  }
  ctx.fill();
}

export function drawScene(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { model, view } = sc;
  const s = cellSize(view);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, sc.width, sc.height);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sc.base, view.x, view.y, model.width * s, model.height * s);

  const range = visibleCells(view, model, sc);

  // Patterns and icons are unreadable on tiny cells.
  if (s >= 8) {
    // Cells of one type are filled with a repeating tile in a single path: far faster
    // than drawing every cell. Tiles use device pixels so they stay sharp on HiDPI.
    const px = Math.max(1, Math.round(s * ctx.getTransform().a));
    const byType = new Map<CellType, number[]>();
    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const type = sc.typeOf(effectiveTypeAt(model, sc.lookup, y * model.width + x));
        if (type.pattern === "none" && !type.symbol) continue;
        let cells = byType.get(type);
        if (!cells) byType.set(type, (cells = []));
        cells.push(y * model.width + x);
      }
    }
    ctx.imageSmoothingEnabled = true;
    for (const [type, cells] of byType) {
      const pattern = ctx.createPattern(decorTile(type, px), "repeat");
      if (!pattern) continue;
      // One tile per cell, anchored at the map origin.
      pattern.setTransform(new DOMMatrix([s / px, 0, 0, s / px, view.x, view.y]));
      ctx.fillStyle = pattern;
      fillCells(ctx, cells, model.width, view, s);
    }
  }

  if (sc.preview) {
    ctx.fillStyle = sc.preview.color;
    ctx.globalAlpha = 0.75;
    fillCells(ctx, sc.preview.cells, model.width, view, s);
    ctx.globalAlpha = 1;
  }

  if (s >= 6) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const top = view.y + range.y0 * s;
    const bottom = view.y + (range.y1 + 1) * s;
    const left = view.x + range.x0 * s;
    const right = view.x + (range.x1 + 1) * s;
    for (let x = range.x0; x <= range.x1 + 1; x++) {
      const px = Math.round(view.x + x * s) + 0.5;
      line(ctx, px, top, px, bottom);
    }
    for (let y = range.y0; y <= range.y1 + 1; y++) {
      const py = Math.round(view.y + y * s) + 0.5;
      line(ctx, left, py, right, py);
    }
    ctx.stroke();
  }

  if (sc.activeRegion) {
    ctx.fillStyle = COLORS.regionFill;
    fillCells(ctx, sc.activeRegion.cells, model.width, view, s);
  }

  if (sc.selection.size > 0) {
    ctx.fillStyle = COLORS.selection;
    fillCells(ctx, sc.selection, model.width, view, s);
    ctx.strokeStyle = COLORS.selectionLine;
    ctx.lineWidth = 1.5;
    strokeSegments(ctx, sc.selectionOutline, view, s);
  }

  ctx.lineCap = "round";
  for (const r of sc.regions) {
    const active = r.id === sc.activeRegion?.id;
    ctx.strokeStyle = active ? COLORS.regionActive : COLORS.region;
    ctx.lineWidth = active ? 3 : 2;
    strokeSegments(ctx, r.segments, view, s);
  }
  ctx.lineCap = "butt";

  if (sc.frame) {
    const f = sc.frame;
    ctx.strokeStyle = COLORS.selectionLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      view.x + f.x0 * s + 0.5,
      view.y + f.y0 * s + 0.5,
      (f.x1 - f.x0 + 1) * s,
      (f.y1 - f.y0 + 1) * s,
    );
    ctx.setLineDash([]);
  }

  if (sc.hover) {
    ctx.strokeStyle = COLORS.hover;
    ctx.lineWidth = 1;
    ctx.strokeRect(view.x + sc.hover.x * s + 0.5, view.y + sc.hover.y * s + 0.5, s - 1, s - 1);
  }

  const fontSize = Math.round(Math.min(14, Math.max(10, s * 0.5)));
  ctx.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of sc.regions) {
    if (r.labelCell === null || r.name === "") continue;
    const lx = view.x + ((r.labelCell % model.width) + 0.5) * s;
    const ly = view.y + (Math.floor(r.labelCell / model.width) + 0.5) * s;
    if (lx < -200 || ly < -50 || lx > sc.width + 200 || ly > sc.height + 50) continue;
    const w = ctx.measureText(r.name).width + 10;
    ctx.fillStyle = COLORS.labelBg;
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - fontSize * 0.75, w, fontSize * 1.5, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.labelText;
    ctx.fillText(r.name, lx, ly + 1);
  }
}
