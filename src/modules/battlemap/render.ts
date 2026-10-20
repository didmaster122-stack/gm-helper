// Canvas drawing for the editor. Cell colours go into a 1 px-per-cell bitmap that is
// scaled up in one drawImage call; patterns, icons and overlays are drawn only for the
// visible cells, so a 200×200 map stays fast.
import { contrastColor, type CellIcon, type CellSymbol, type CellType } from "./domain/cellTypes";
import { effectiveTypeAt, type BattlemapModel, type Segment } from "./domain/grid";
import { containRect } from "./domain/images";
import { footprint, type MapObject, type ObjectDef } from "./domain/objects";
import { CELL_PX, cellSize, visibleCells, type View } from "./domain/view";
import { getImage } from "./imageCache";

export const COLORS = {
  grid: "rgba(0, 0, 0, 0.28)",
  region: "#c9a24a",
  regionActive: "#ffd36b",
  regionFill: "rgba(255, 211, 107, 0.28)",
  selection: "rgba(77, 156, 255, 0.38)",
  selectionLine: "#e8f1ff",
  hover: "rgba(255, 255, 255, 0.8)",
  labelBg: "rgba(22, 23, 28, 0.82)",
  labelText: "#f0e6cc",
  objectBorder: "rgba(0, 0, 0, 0.55)",
  objectSelected: "#4d9cff",
  missingObject: "#8a8a90",
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
  if (type.symbol) drawSymbol(ctx, type.symbol, x, y, s);
  ctx.restore();
}

/** Picture fitted into a box. Nothing is drawn until it is decoded. */
function drawPicture(
  ctx: CanvasRenderingContext2D,
  url: string,
  box: { x: number; y: number; width: number; height: number },
) {
  const img = getImage(url);
  if (!img) return;
  const pad = Math.min(box.width, box.height) * 0.06;
  const r = containRect(
    { width: img.naturalWidth, height: img.naturalHeight },
    { x: box.x + pad, y: box.y + pad, width: box.width - pad * 2, height: box.height - pad * 2 },
  );
  ctx.drawImage(img, r.x, r.y, r.width, r.height);
}

/** A letter, icon (in the current fill and stroke style) or picture in the square (x, y, s). */
function drawSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: CellSymbol,
  x: number,
  y: number,
  s: number,
) {
  switch (symbol.kind) {
    case "icon":
      drawIcon(ctx, symbol.value, x, y, s);
      return;
    case "letter":
      ctx.font = `600 ${Math.round(s * 0.6)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(symbol.value, x + s / 2, y + s / 2 + s * 0.03);
      return;
    case "image":
      drawPicture(ctx, symbol.value, { x, y, width: s, height: s });
      return;
  }
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
  // Pictures are long data URLs: their length and tail are enough to tell them apart.
  const symbol = type.symbol?.value ?? "";
  const symbolKey =
    type.symbol?.kind === "image" ? `${symbol.length}:${symbol.slice(-32)}` : symbol;
  const key = `${type.id}|${type.color}|${type.pattern}|${symbolKey}|${px}`;
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

// ---- Objects ----

export type ObjectDefOf = (defId: string) => ObjectDef | undefined;

const MISSING_SYMBOL: CellSymbol = { kind: "letter", value: "?" };

/**
 * One object: its footprint filled with the background colour and the symbol in the
 * middle, turned with the object. Deleted catalog objects show a grey "?".
 */
export function drawObject(
  ctx: CanvasRenderingContext2D,
  object: MapObject,
  def: ObjectDef | undefined,
  view: View,
) {
  const s = cellSize(view);
  const { w, h } = footprint(def ?? null, object.rotation);
  const x = view.x + object.x * s;
  const y = view.y + object.y * s;
  const inset = Math.min(2, s * 0.06);
  const color = def?.color ?? COLORS.missingObject;
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x + inset, y + inset, w * s - inset * 2, h * s - inset * 2);
  ctx.strokeStyle = COLORS.objectBorder;
  ctx.lineWidth = Math.max(1, s / 16);
  ctx.strokeRect(x + inset, y + inset, w * s - inset * 2, h * s - inset * 2);

  // The symbol is drawn in the object's own (unrotated) frame around its centre.
  ctx.translate(x + (w * s) / 2, y + (h * s) / 2);
  ctx.rotate((object.rotation * Math.PI) / 180);
  const ow = (def?.width ?? 1) * s;
  const oh = (def?.height ?? 1) * s;
  const symbol = def ? def.symbol : MISSING_SYMBOL;
  if (symbol?.kind === "image") {
    drawPicture(ctx, symbol.value, { x: -ow / 2, y: -oh / 2, width: ow, height: oh });
  } else if (symbol) {
    const ink = contrastColor(color);
    const side = Math.min(ow, oh);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, side / 16);
    ctx.globalAlpha *= 0.85;
    drawSymbol(ctx, symbol, -side / 2, -side / 2, side);
  }
  ctx.restore();
}

export function drawObjects(
  ctx: CanvasRenderingContext2D,
  objects: readonly MapObject[],
  defOf: ObjectDefOf,
  view: View,
) {
  for (const o of objects) drawObject(ctx, o, defOf(o.defId), view);
}

/** A catalog object scaled into a square swatch (palette, legend). */
export function drawObjectSwatch(
  ctx: CanvasRenderingContext2D,
  def: ObjectDef,
  x: number,
  y: number,
  size: number,
) {
  const cells = Math.max(def.width, def.height);
  const s = size / cells;
  const view: View = {
    x: x + ((cells - def.width) * s) / 2,
    y: y + ((cells - def.height) * s) / 2,
    zoom: s / CELL_PX,
  };
  drawObject(ctx, { id: "", defId: def.id, x: 0, y: 0, rotation: 0 }, def, view);
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
  /** Fill around the map; follows the app theme. */
  background: string;
  regions: readonly RegionOverlay[];
  activeRegion: { id: string; cells: readonly number[] } | null;
  selection: ReadonlySet<number>;
  selectionOutline: readonly Segment[];
  /** Cells to preview with the given colour (rectangle tool). */
  preview: { cells: readonly number[]; color: string } | null;
  /** Selection frame in cells (inclusive). */
  frame: { x0: number; y0: number; x1: number; y1: number } | null;
  hover: { x: number; y: number } | null;
  objectDefOf: ObjectDefOf;
  selectedObjects: ReadonlySet<string>;
  /** Objects being placed or dragged, drawn translucent. */
  ghost: readonly MapObject[] | null;
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

type Range = ReturnType<typeof visibleCells>;

/** Cell colours (scaled bitmap) and, on cells big enough to read them, patterns and symbols. */
export function drawCells(
  ctx: CanvasRenderingContext2D,
  model: BattlemapModel,
  lookup: Int32Array,
  base: HTMLCanvasElement,
  typeOf: TypeOf,
  view: View,
  range: Range,
) {
  const s = cellSize(view);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, view.x, view.y, model.width * s, model.height * s);
  if (s < 8) return;

  // Cells of one type are filled with a repeating tile in a single path: far faster
  // than drawing every cell. Tiles use device pixels so they stay sharp on HiDPI.
  const px = Math.max(1, Math.round(s * ctx.getTransform().a));
  const byType = new Map<CellType, number[]>();
  for (let y = range.y0; y <= range.y1; y++) {
    for (let x = range.x0; x <= range.x1; x++) {
      const type = typeOf(effectiveTypeAt(model, lookup, y * model.width + x));
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

export function drawGrid(ctx: CanvasRenderingContext2D, view: View, range: Range, lineWidth = 1) {
  const s = cellSize(view);
  // Odd widths sit on half pixels to stay crisp.
  const offset = lineWidth % 2 === 1 ? 0.5 : 0;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const top = view.y + range.y0 * s;
  const bottom = view.y + (range.y1 + 1) * s;
  const left = view.x + range.x0 * s;
  const right = view.x + (range.x1 + 1) * s;
  for (let x = range.x0; x <= range.x1 + 1; x++) {
    const px = Math.round(view.x + x * s) + offset;
    line(ctx, px, top, px, bottom);
  }
  for (let y = range.y0; y <= range.y1 + 1; y++) {
    const py = Math.round(view.y + y * s) + offset;
    line(ctx, left, py, right, py);
  }
  ctx.stroke();
}

export function drawRegionOutlines(
  ctx: CanvasRenderingContext2D,
  regions: readonly RegionOverlay[],
  view: View,
  lineWidth: number,
  activeId: string | null = null,
) {
  const s = cellSize(view);
  ctx.lineCap = "round";
  for (const r of regions) {
    const active = r.id === activeId;
    ctx.strokeStyle = active ? COLORS.regionActive : COLORS.region;
    ctx.lineWidth = active ? lineWidth * 1.5 : lineWidth;
    strokeSegments(ctx, r.segments, view, s);
  }
  ctx.lineCap = "butt";
}

export function drawRegionLabels(
  ctx: CanvasRenderingContext2D,
  regions: readonly RegionOverlay[],
  mapWidth: number,
  view: View,
  fontSize: number,
  bounds: { width: number; height: number },
) {
  const s = cellSize(view);
  ctx.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of regions) {
    if (r.labelCell === null || r.name === "") continue;
    const lx = view.x + ((r.labelCell % mapWidth) + 0.5) * s;
    const ly = view.y + (Math.floor(r.labelCell / mapWidth) + 0.5) * s;
    if (lx < -400 || ly < -100 || lx > bounds.width + 400 || ly > bounds.height + 100) continue;
    const w = ctx.measureText(r.name).width + fontSize * 0.8;
    ctx.fillStyle = COLORS.labelBg;
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - fontSize * 0.75, w, fontSize * 1.5, fontSize * 0.3);
    ctx.fill();
    ctx.fillStyle = COLORS.labelText;
    ctx.fillText(r.name, lx, ly + fontSize * 0.07);
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { model, view } = sc;
  const s = cellSize(view);
  ctx.fillStyle = sc.background;
  ctx.fillRect(0, 0, sc.width, sc.height);

  const range = visibleCells(view, model, sc);
  drawCells(ctx, model, sc.lookup, sc.base, sc.typeOf, view, range);

  if (sc.preview) {
    ctx.fillStyle = sc.preview.color;
    ctx.globalAlpha = 0.75;
    fillCells(ctx, sc.preview.cells, model.width, view, s);
    ctx.globalAlpha = 1;
  }

  if (s >= 6) drawGrid(ctx, view, range);

  if (sc.activeRegion) {
    ctx.fillStyle = COLORS.regionFill;
    fillCells(ctx, sc.activeRegion.cells, model.width, view, s);
  }

  drawObjects(ctx, model.objects, sc.objectDefOf, view);

  if (sc.selection.size > 0) {
    ctx.fillStyle = COLORS.selection;
    fillCells(ctx, sc.selection, model.width, view, s);
    ctx.strokeStyle = COLORS.selectionLine;
    ctx.lineWidth = 1.5;
    strokeSegments(ctx, sc.selectionOutline, view, s);
  }

  drawRegionOutlines(ctx, sc.regions, view, 2, sc.activeRegion?.id ?? null);

  if (sc.selectedObjects.size > 0) {
    ctx.strokeStyle = COLORS.objectSelected;
    ctx.lineWidth = 2.5;
    for (const o of model.objects) {
      if (!sc.selectedObjects.has(o.id)) continue;
      const { w, h } = footprint(sc.objectDefOf(o.defId) ?? null, o.rotation);
      ctx.strokeRect(view.x + o.x * s + 1, view.y + o.y * s + 1, w * s - 2, h * s - 2);
    }
  }

  if (sc.ghost) {
    ctx.globalAlpha = 0.6;
    drawObjects(ctx, sc.ghost, sc.objectDefOf, view);
    ctx.globalAlpha = 1;
  }

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
  drawRegionLabels(ctx, sc.regions, model.width, view, fontSize, sc);
}
