// The only place that talks to the file system directly (see CLAUDE.md).
// Paths passed here are absolute; Windows accepts "/" as a separator.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readFile,
  remove,
  rename,
  watch,
  writeFile,
  type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { isServiceName } from "./names";

export { isServiceName };

export async function pickDirectory(title: string, defaultPath?: string): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title, defaultPath });
  return typeof result === "string" ? result : null;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** "Save as" dialog; Windows itself asks before overwriting an existing file. */
export async function pickSavePath(
  title: string,
  defaultPath: string,
  filters: FileFilter[],
): Promise<string | null> {
  return (await save({ title, defaultPath, filters })) ?? null;
}

export async function pickFile(title: string, filters: FileFilter[]): Promise<string | null> {
  const result = await open({ multiple: false, directory: false, title, filters });
  return typeof result === "string" ? result : null;
}

export function pathExists(path: string): Promise<boolean> {
  return exists(path);
}

/** Names of visible subfolders, sorted for display. */
export async function listSubfolders(path: string): Promise<string[]> {
  const entries = await readDir(path);
  return entries
    .filter((e) => e.isDirectory && !isServiceName(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "ru"));
}

/** Names of all entries (files and folders) directly inside a folder. */
export async function listNames(path: string): Promise<string[]> {
  return (await readDir(path)).map((e) => e.name);
}

export interface LibraryScanResult {
  files: { relPath: string; size: number; mtime: number }[];
  folders: string[];
  errors: string[];
}

export function scanLibrary(
  root: string,
  extensions: readonly string[],
): Promise<LibraryScanResult> {
  return invoke("scan_library", { root, extensions });
}

export interface FileInfo {
  path: string;
  hash: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
}

export function inspectFiles(paths: readonly string[]): Promise<FileInfo[]> {
  return invoke("inspect_files", { paths });
}

/** Recycle bin, so the user can restore what was deleted. */
export function moveToTrash(paths: readonly string[]): Promise<void> {
  return invoke("move_to_trash", { paths });
}

export function createFolder(path: string): Promise<void> {
  return mkdir(path, { recursive: true });
}

/** Removes a folder only if it is empty (fails otherwise). */
export function removeEmptyFolder(path: string): Promise<void> {
  return remove(path, { recursive: false });
}

export async function movePath(from: string, to: string): Promise<void> {
  if (from.toLowerCase() !== to.toLowerCase() && (await exists(to))) {
    throw new Error(`Target already exists: ${to}`);
  }
  await rename(from, to);
}

export async function copyNewFile(from: string, to: string): Promise<void> {
  if (await exists(to)) throw new Error(`Target already exists: ${to}`);
  await copyFile(from, to);
}

export function revealInExplorer(path: string): Promise<void> {
  return revealItemInDir(path);
}

/** URL the webview can load an image from. */
export function fileUrl(path: string): string {
  return convertFileSrc(path);
}

/** Watches a folder tree; the callback is debounced by the plugin. */
export function watchTree(path: string, onChange: () => void, delayMs = 800): Promise<UnwatchFn> {
  return watch(path, () => onChange(), { recursive: true, delayMs });
}

// App cache (thumbnails). Never inside the user's library.

export async function cacheDir(...parts: string[]): Promise<string> {
  const dir = await join(await appCacheDir(), ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeCacheFile(path: string, data: Uint8Array): Promise<void> {
  await writeFile(path, data);
}

/**
 * Writes a file the app owns inside the library (token PNGs), replacing it if
 * present. Direct writes are only allowed to the app cache, so the data is
 * staged there and copied into place.
 */
export async function writeOwnLibraryFile(path: string, data: Uint8Array): Promise<void> {
  await writeViaStaging(path, data);
}

/** Writes an exported file to the path the user picked in {@link pickSavePath}. */
export async function writeChosenFile(path: string, data: Uint8Array): Promise<void> {
  await writeViaStaging(path, data);
}

async function stagingPath(): Promise<string> {
  return join(await cacheDir("staging"), `${crypto.randomUUID()}.tmp`);
}

async function writeViaStaging(path: string, data: Uint8Array): Promise<void> {
  const staging = await stagingPath();
  await writeFile(staging, data);
  try {
    await copyFile(staging, path);
  } finally {
    await remove(staging).catch(() => undefined);
  }
}

/** Reads a file the user picked; reading is only allowed in the app cache, so it is copied there. */
export async function readChosenFile(path: string): Promise<Uint8Array> {
  const staging = await stagingPath();
  await copyFile(path, staging);
  try {
    return await readFile(staging);
  } finally {
    await remove(staging).catch(() => undefined);
  }
}

/** Puts a PNG file on the clipboard as an image (e.g. to paste a token into a VTT). */
export async function copyPngToClipboard(path: string): Promise<void> {
  const response = await fetch(fileUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot read ${path}: ${response.status}`);
  const blob = new Blob([await response.arrayBuffer()], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
