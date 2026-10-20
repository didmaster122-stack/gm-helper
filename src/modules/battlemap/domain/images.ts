/** Custom pictures of cell types and objects are stored downscaled to this side. */
export const MAX_IMAGE_SIDE = 256;
/** A 256 px WebP is far smaller; anything bigger in a file is rejected as broken. */
export const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000;

/** Size that fits into `max`×`max` keeping the aspect ratio; never upscales. */
export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_IMAGE_SIDE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const DATA_URL = /^data:image\/(png|webp|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/;

export function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URL.test(value)
  );
}

/** Rectangle of an image drawn "contain"-style into a box, centred. */
export function containRect(
  image: { width: number; height: number },
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}
