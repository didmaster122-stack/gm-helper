// Token framing: which part of the art ends up inside the round token.
// Pure functions, shared by the editor preview and the PNG export.

export const TOKEN_SIZES = [256, 512, 1024] as const;
export type TokenSize = (typeof TOKEN_SIZES)[number];
export const DEFAULT_TOKEN_SIZE: TokenSize = 512;

export function isTokenSize(value: number): value is TokenSize {
  return (TOKEN_SIZES as readonly number[]).includes(value);
}

/** Creature size in grid cells per side: Medium 1×1, Large 2×2, Huge 3×3, Gargantuan 4×4. */
export const CREATURE_SIZES = [1, 2, 3, 4] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];
export const DEFAULT_CREATURE_SIZE: CreatureSize = 1;

export function isCreatureSize(value: number): value is CreatureSize {
  return (CREATURE_SIZES as readonly number[]).includes(value);
}

/** Side of the PNG: `size` pixels for each cell the creature covers. */
export function tokenPixelSize(size: TokenSize, cells: CreatureSize): number {
  return size * cells;
}

export interface TokenCrop {
  /** Circle centre as a fraction of the image width (0 = left edge, 1 = right edge). */
  centerX: number;
  /** Circle centre as a fraction of the image height. */
  centerY: number;
  /** 1: the circle diameter equals the shorter image side; 2: half of it, and so on. */
  zoom: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_CROP: TokenCrop = { centerX: 0.5, centerY: 0.5, zoom: 1 };

/** The circle must hold at least this many source pixels across. */
const MIN_DIAMETER_PX = 24;
const MAX_ZOOM = 20;

/** From "the whole image fits in the circle" to "a small detail fills it". */
export function zoomLimits(image: ImageSize): { min: number; max: number } {
  const short = Math.min(image.width, image.height);
  const diagonal = Math.hypot(image.width, image.height);
  return {
    min: short / diagonal,
    max: Math.min(MAX_ZOOM, Math.max(1, short / MIN_DIAMETER_PX)),
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Keeps the centre inside the image and the zoom within limits; repairs non-finite values. */
export function clampCrop(crop: TokenCrop, image: ImageSize): TokenCrop {
  const { min, max } = zoomLimits(image);
  const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  return {
    centerX: clamp(finite(crop.centerX, DEFAULT_CROP.centerX), 0, 1),
    centerY: clamp(finite(crop.centerY, DEFAULT_CROP.centerY), 0, 1),
    zoom: clamp(finite(crop.zoom, DEFAULT_CROP.zoom), min, max),
  };
}

/** Circle diameter in source pixels. */
export function cropDiameter(crop: TokenCrop, image: ImageSize): number {
  return Math.min(image.width, image.height) / crop.zoom;
}

/** Square of the source image covered by the token (may extend past the image edges). */
export function cropRegion(crop: TokenCrop, image: ImageSize): Rect {
  const d = cropDiameter(crop, image);
  return {
    x: crop.centerX * image.width - d / 2,
    y: crop.centerY * image.height - d / 2,
    width: d,
    height: d,
  };
}

/**
 * Where to draw the whole image on a square canvas of `outputSize` so that the
 * crop region fills it. Drawing the whole image avoids relying on how canvases
 * handle source rectangles that extend past the image.
 */
export function imagePlacement(crop: TokenCrop, image: ImageSize, outputSize: number): Rect {
  const region = cropRegion(crop, image);
  const k = outputSize / region.width;
  return {
    x: 0 - region.x * k,
    y: 0 - region.y * k,
    width: image.width * k,
    height: image.height * k,
  };
}

/** Moves the image by (dx, dy) screen pixels in a view where the circle is `viewDiameter` wide. */
export function panCrop(
  crop: TokenCrop,
  dx: number,
  dy: number,
  viewDiameter: number,
  image: ImageSize,
): TokenCrop {
  const k = cropDiameter(crop, image) / viewDiameter;
  return clampCrop(
    {
      ...crop,
      centerX: crop.centerX - (dx * k) / image.width,
      centerY: crop.centerY - (dy * k) / image.height,
    },
    image,
  );
}

/**
 * Sets a new zoom keeping the image point under the pointer in place.
 * `px`, `py` — pointer offset from the circle centre in view pixels.
 */
export function zoomCropAt(
  crop: TokenCrop,
  zoom: number,
  px: number,
  py: number,
  viewDiameter: number,
  image: ImageSize,
): TokenCrop {
  const next = clampCrop({ ...crop, zoom }, image);
  const before = cropDiameter(crop, image) / viewDiameter;
  const after = cropDiameter(next, image) / viewDiameter;
  const sx = crop.centerX * image.width + px * before;
  const sy = crop.centerY * image.height + py * before;
  return clampCrop(
    {
      zoom: next.zoom,
      centerX: (sx - px * after) / image.width,
      centerY: (sy - py * after) / image.height,
    },
    image,
  );
}

/** Slider position (0…1) on a logarithmic scale, so each step zooms by the same factor. */
export function zoomToSlider(zoom: number, image: ImageSize): number {
  const { min, max } = zoomLimits(image);
  if (max <= min) return 0;
  return clamp(Math.log(zoom / min) / Math.log(max / min), 0, 1);
}

export function sliderToZoom(t: number, image: ImageSize): number {
  const { min, max } = zoomLimits(image);
  return min * Math.pow(max / min, clamp(t, 0, 1));
}
