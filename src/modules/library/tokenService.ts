// Token use cases: rendering, files in "_tokens" and their records.
import { getDb } from "../../shared/db";
import {
  createFolder,
  fileUrl,
  listNames,
  movePath,
  moveToTrash,
  pathExists,
  writeOwnLibraryFile,
} from "../../shared/fs";
import { joinRel, parentRel, toAbsolute } from "./domain/paths";
import { imagePlacement, tokenPixelSize } from "./domain/tokenCrop";
import { frameRing } from "./domain/tokenFrame";
import {
  artBaseName,
  nextTokenFileName,
  resizedTokenFileName,
  retargetTokenNames,
  tokensFolder,
} from "./domain/tokenNames";
import type { Art, Token } from "./domain/types";
import * as repo from "./repo";

export async function loadImage(path: string): Promise<HTMLImageElement> {
  const img = new Image();
  // The asset protocol sends CORS headers; this keeps the canvas exportable.
  img.crossOrigin = "anonymous";
  img.src = fileUrl(path);
  await img.decode();
  return img;
}

/** Everything the token editor sets; the PNG is rendered from these. */
export type TokenParams = Pick<Token, "crop" | "size" | "cells" | "frame">;

/** Round PNG with a transparent background and an optional frame along the edge. */
export async function renderTokenPng(
  img: HTMLImageElement,
  { crop, size: cellSize, cells, frame }: TokenParams,
): Promise<Uint8Array> {
  const size = tokenPixelSize(cellSize, cells);
  const place = imagePlacement(crop, { width: img.naturalWidth, height: img.naturalHeight }, size);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";

  // Large downscales look better resized by the decoder than by drawImage.
  const width = Math.round(place.width);
  const height = Math.round(place.height);
  if (width < img.naturalWidth && width > 0 && height > 0) {
    const bitmap = await createImageBitmap(img, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
    ctx.drawImage(bitmap, place.x, place.y, place.width, place.height);
    bitmap.close();
  } else {
    ctx.drawImage(img, place.x, place.y, place.width, place.height);
  }
  const ring = frameRing(frame, size);
  if (ring) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, ring.outer, 0, Math.PI * 2);
    ctx.arc(size / 2, size / 2, ring.inner, 0, Math.PI * 2, true);
    ctx.fillStyle = frame.color;
    ctx.fill();
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createToken(
  root: string,
  art: Art,
  img: HTMLImageElement,
  params: TokenParams,
): Promise<Token> {
  const folder = tokensFolder(art.relPath);
  const folderAbs = toAbsolute(root, folder);
  await createFolder(folderAbs);
  const fileName = nextTokenFileName(
    artBaseName(art.fileName),
    await listNames(folderAbs),
    params.cells,
  );
  const relPath = joinRel(folder, fileName);
  // The name was free a moment ago; never replace a file the app did not write for this token.
  if (await pathExists(toAbsolute(root, relPath))) throw new Error(`File exists: ${relPath}`);
  await writeOwnLibraryFile(toAbsolute(root, relPath), await renderTokenPng(img, params));

  const now = new Date().toISOString();
  const token: Token = {
    id: crypto.randomUUID(),
    artId: art.id,
    relPath,
    ...params,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertToken(await getDb(), token);
  return token;
}

/**
 * Re-renders an existing token with new parameters, overwriting its file. When the creature
 * size changes, the file is renamed to carry the new size (if that name is free).
 */
export async function updateToken(
  root: string,
  token: Token,
  img: HTMLImageElement,
  params: TokenParams,
): Promise<Token> {
  await createFolder(toAbsolute(root, parentRel(token.relPath)));
  const relPath = await resizedTokenPath(root, token, params);
  if (relPath !== token.relPath && (await pathExists(toAbsolute(root, token.relPath)))) {
    await movePath(toAbsolute(root, token.relPath), toAbsolute(root, relPath));
  }
  await writeOwnLibraryFile(toAbsolute(root, relPath), await renderTokenPng(img, params));
  const updated = { ...token, ...params, relPath, updatedAt: new Date().toISOString() };
  await repo.saveTokens(await getDb(), [updated]);
  return updated;
}

/** Where the token file goes after the edit: its path, or a new one when the size changed. */
async function resizedTokenPath(root: string, token: Token, params: TokenParams): Promise<string> {
  if (params.cells === token.cells) return token.relPath;
  const folder = parentRel(token.relPath);
  const fileName = token.relPath.slice(token.relPath.lastIndexOf("/") + 1);
  const name = resizedTokenFileName(fileName, params.cells);
  if (name === fileName) return token.relPath;
  const taken = await listNames(toAbsolute(root, folder));
  // Never replace a file the app did not write for this token.
  const free = !taken.some((n) => n.toLowerCase() === name.toLowerCase());
  const base = fileName.slice(0, fileName.toLowerCase().lastIndexOf(".token-"));
  return joinRel(folder, free ? name : nextTokenFileName(base, taken, params.cells));
}

/** Moves the token file to the recycle bin (if it is still there) and forgets the token. */
export async function deleteToken(root: string, token: Token): Promise<void> {
  await trashTokenFiles(root, [token]);
  await repo.deleteTokens(await getDb(), [token.id]);
}

export async function trashTokenFiles(root: string, tokens: readonly Token[]): Promise<void> {
  const paths: string[] = [];
  for (const t of tokens) {
    const abs = toAbsolute(root, t.relPath);
    if (await pathExists(abs)) paths.push(abs);
  }
  if (paths.length > 0) await moveToTrash(paths);
}

/**
 * Moves and renames token files to follow an art that moved to `artRelPath`.
 * Returns the tokens with new paths (to be saved by the caller); tokens whose
 * file is gone keep their old path.
 */
export async function relocateTokenFiles(
  root: string,
  tokens: readonly Token[],
  artRelPath: string,
): Promise<Token[]> {
  if (tokens.length === 0) return [];
  const folder = tokensFolder(artRelPath);
  const folderAbs = toAbsolute(root, folder);
  await createFolder(folderAbs);

  const own = new Set(tokens.map((t) => t.relPath.toLowerCase()));
  const taken = (await listNames(folderAbs)).filter(
    (name) => !own.has(joinRel(folder, name).toLowerCase()),
  );
  const names = retargetTokenNames(
    tokens.map((t) => t.relPath.slice(t.relPath.lastIndexOf("/") + 1)),
    artBaseName(artRelPath.slice(artRelPath.lastIndexOf("/") + 1)),
    taken,
  );

  const now = new Date().toISOString();
  const result: Token[] = [];
  for (const [i, token] of tokens.entries()) {
    const target = joinRel(folder, names[i] ?? "");
    if (target === token.relPath) continue;
    try {
      await movePath(toAbsolute(root, token.relPath), toAbsolute(root, target));
      result.push({ ...token, relPath: target, updatedAt: now });
    } catch {
      // A token file deleted outside the app stays linked to its old path.
    }
  }
  return result;
}
