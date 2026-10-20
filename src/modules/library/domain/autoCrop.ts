// Automatic token framing for batch creation: around a detected face, or by a fixed rule.
// Pure functions; the detector itself lives in `faceDetector.ts`.
import { zoomLimits, type ImageSize, type Rect, type TokenCrop } from "./tokenCrop";

/** How the circle was chosen; "manual" once the user adjusted it in the editor. */
export type CropMethod = "face" | "rule" | "manual";

export interface FaceBox extends Rect {
  /** Detector confidence, 0…1. */
  score: number;
}

/**
 * The detector box spans roughly brows to chin; the token shows the whole head
 * with hair and a bit of the shoulders.
 */
const HEAD_MARGIN = 2.2;
/** The circle centre moves up by this share of the box height: there is more head above the brows. */
const HEAD_LIFT = 0.15;
/** Vertical arts: share of the space below the circle that stays above it. */
const RULE_TOP = 0.1;
/** An art this much longer than wide (or wider than long) is searched in parts as well. */
const ELONGATED = 1.25;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Circle with centre (cx, cy) in image pixels and diameter `d`, kept inside the image. */
function circleInside(cx: number, cy: number, d: number, image: ImageSize): TokenCrop {
  const short = Math.min(image.width, image.height);
  const minDiameter = short / zoomLimits(image).max;
  const diameter = clamp(d, minDiameter, short);
  const r = diameter / 2;
  return {
    centerX: clamp(cx, r, image.width - r) / image.width,
    centerY: clamp(cy, r, image.height - r) / image.height,
    zoom: short / diameter,
  };
}

/** Circle around the head of the detected face, entirely inside the art. */
export function faceCrop(face: Rect, image: ImageSize): TokenCrop {
  const side = Math.max(face.width, face.height);
  return circleInside(
    face.x + face.width / 2,
    face.y + face.height / 2 - face.height * HEAD_LIFT,
    side * HEAD_MARGIN,
    image,
  );
}

/** Fallback: the circle spans the short side; on vertical arts it sits near the top. */
export function ruleCrop(image: ImageSize): TokenCrop {
  const d = Math.min(image.width, image.height);
  const cy = image.height > image.width ? d / 2 + (image.height - d) * RULE_TOP : image.height / 2;
  return circleInside(image.width / 2, cy, d, image);
}

/** The most prominent face: the largest one. */
export function pickFace(faces: readonly FaceBox[]): FaceBox | null {
  let best: FaceBox | null = null;
  for (const f of faces) {
    if (!best || f.width * f.height > best.width * best.height) best = f;
  }
  return best;
}

/**
 * Parts of the art to search, in order, until a face is found. The detector sees
 * a downscaled square, so on long arts a face may be too small in the whole image:
 * the top of a vertical art (where a head usually is) and the middle of a wide one
 * are searched separately.
 */
export function searchRegions(image: ImageSize): Rect[] {
  const { width: w, height: h } = image;
  const whole = { x: 0, y: 0, width: w, height: h };
  if (h > w * ELONGATED) {
    const head = w * 0.6;
    return [
      whole,
      { x: 0, y: 0, width: w, height: w },
      { x: (w - head) / 2, y: 0, width: head, height: head },
    ];
  }
  if (w > h * ELONGATED) return [whole, { x: (w - h) / 2, y: 0, width: h, height: h }];
  return [whole];
}

/** A box found in a region scaled to `scaled` pixels, back in image pixels. */
export function regionToImage(box: FaceBox, region: Rect, scaled: ImageSize): FaceBox {
  const kx = region.width / scaled.width;
  const ky = region.height / scaled.height;
  return {
    x: region.x + box.x * kx,
    y: region.y + box.y * ky,
    width: box.width * kx,
    height: box.height * ky,
    score: box.score,
  };
}

/** Size a region is scaled to before detection: at most `max` pixels on the long side. */
export function scaledSize(region: Rect, max: number): ImageSize {
  const k = Math.min(1, max / Math.max(region.width, region.height));
  return {
    width: Math.max(1, Math.round(region.width * k)),
    height: Math.max(1, Math.round(region.height * k)),
  };
}

/** Framing for an art: around the face when there is one, by the rule otherwise. */
export function autoCrop(
  faces: readonly FaceBox[],
  image: ImageSize,
): { crop: TokenCrop; method: CropMethod } {
  const face = pickFace(faces);
  return face
    ? { crop: faceCrop(face, image), method: "face" }
    : { crop: ruleCrop(image), method: "rule" };
}
