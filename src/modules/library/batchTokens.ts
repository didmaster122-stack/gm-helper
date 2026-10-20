// Batch token creation for a group: automatic framing, previews and writing with progress.
import { toAbsolute } from "./domain/paths";
import { autoCrop, type CropMethod } from "./domain/autoCrop";
import { imagePlacement, type ImageSize, type TokenCrop } from "./domain/tokenCrop";
import type { Art, Token } from "./domain/types";
import type { TokenDefaults } from "./tokenDefaults";
import { createToken, loadImage } from "./tokenService";

/** Side of the stored preview square in pixels (the grid shows it at half size). */
export const PREVIEW_SIZE = 192;

export interface Framing {
  crop: TokenCrop;
  method: CropMethod;
  image: ImageSize;
  /** The framed square of the art, without mask or frame. */
  preview: ImageBitmap;
}

/** Square of the art covered by the circle, small enough to keep for dozens of arts. */
export async function renderPreview(img: HTMLImageElement, crop: TokenCrop): Promise<ImageBitmap> {
  const image = { width: img.naturalWidth, height: img.naturalHeight };
  const place = imagePlacement(crop, image, PREVIEW_SIZE);
  const canvas = new OffscreenCanvas(PREVIEW_SIZE, PREVIEW_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, place.x, place.y, place.width, place.height);
  return canvas.transferToImageBitmap();
}

/** Opens the art, looks for a face and frames the token around it (or by the rule). */
export async function frameArt(root: string, art: Art): Promise<Framing> {
  const img = await loadImage(toAbsolute(root, art.relPath));
  const image = { width: img.naturalWidth, height: img.naturalHeight };
  // The detector and its runtime are large: loaded on first use, not with the app.
  const { findFaces } = await import("./faceDetector");
  const faces = (await findFaces(img, image)) ?? [];
  const { crop, method } = autoCrop(faces, image);
  return { crop, method, image, preview: await renderPreview(img, crop) };
}

/** Preview for a crop the user adjusted in the editor. */
export async function reframeArt(root: string, art: Art, crop: TokenCrop): Promise<ImageBitmap> {
  return renderPreview(await loadImage(toAbsolute(root, art.relPath)), crop);
}

export interface BatchJob {
  art: Art;
  crop: TokenCrop;
}

export interface BatchResult {
  created: Token[];
  /** Arts whose token could not be written. */
  failed: Art[];
  cancelled: boolean;
}

/**
 * Writes the tokens one by one. Cancelling stops before the next art; tokens
 * already written stay. `onToken` gets each new token as soon as it exists.
 */
export async function writeTokens(
  root: string,
  jobs: readonly BatchJob[],
  options: TokenDefaults,
  hooks: {
    isCancelled: () => boolean;
    onProgress: (done: number) => void;
    onToken: (token: Token) => void;
  },
): Promise<BatchResult> {
  const result: BatchResult = { created: [], failed: [], cancelled: false };
  for (const [i, job] of jobs.entries()) {
    if (hooks.isCancelled()) {
      result.cancelled = true;
      break;
    }
    try {
      const img = await loadImage(toAbsolute(root, job.art.relPath));
      const token = await createToken(root, job.art, img, { ...options, crop: job.crop });
      result.created.push(token);
      hooks.onToken(token);
    } catch (error) {
      console.error("Token was not written", job.art.relPath, error);
      result.failed.push(job.art);
    }
    hooks.onProgress(i + 1);
  }
  return result;
}
