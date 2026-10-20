// Custom pictures for cell types and objects: a copy downscaled to 256 px is kept in
// the database, so moving or deleting the source file does not break the symbol.
import { fileUrl, pickFile, readChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { fitWithin } from "./domain/images";

const PICTURE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

function downscale(source: CanvasImageSource, width: number, height: number): string {
  const size = fitWithin(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  // WebP keeps transparency and is small.
  return canvas.toDataURL("image/webp", 0.9);
}

/** Asks for an image file and returns its downscaled copy, or null when cancelled. */
export async function pictureFromFile(): Promise<string | null> {
  const path = await pickFile(ru.picture.fileTitle, [
    { name: ru.picture.filter, extensions: PICTURE_EXTENSIONS },
  ]);
  if (!path) return null;
  // A copy backed by a plain ArrayBuffer, as Blob requires.
  const bytes = new Uint8Array(await readChosenFile(path));
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    return downscale(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Downscaled copy of an art from the library (absolute path). */
export async function pictureFromPath(absolutePath: string): Promise<string> {
  const img = new Image();
  // Without CORS the canvas is tainted and cannot be exported (the asset protocol sends the headers).
  img.crossOrigin = "anonymous";
  img.src = fileUrl(absolutePath);
  await img.decode();
  return downscale(img, img.naturalWidth, img.naturalHeight);
}
