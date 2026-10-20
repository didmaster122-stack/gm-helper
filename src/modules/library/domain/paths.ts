import { isServiceName } from "../../../shared/fs/names";
import type { Art } from "./types";

export { isServiceName };

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export function splitExtension(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

export function isSupportedImage(fileName: string): boolean {
  const { ext } = splitExtension(fileName);
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export function artName(art: Pick<Art, "displayName" | "fileName">): string {
  return art.displayName?.trim() || splitExtension(art.fileName).base;
}

export interface PathLocation {
  system: string | null;
  group: string | null;
  unsorted: boolean;
  fileName: string;
}

/** Interprets a relative path in the System/Group/file layout. */
export function classifyPath(relPath: string): PathLocation {
  const parts = relPath.split("/");
  const fileName = parts[parts.length - 1] ?? relPath;
  const folders = parts.slice(0, -1);
  return {
    system: folders[0] ?? null,
    group: folders[1] ?? null,
    unsorted: folders.length !== 2,
    fileName,
  };
}

export function joinRel(...parts: string[]): string {
  return parts.filter((p) => p !== "").join("/");
}

export function parentRel(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? "" : relPath.slice(0, i);
}

export function toAbsolute(root: string, relPath: string): string {
  const base = root.replace(/[\\/]+$/, "");
  return relPath === "" ? base : `${base}/${relPath}`;
}

/** Replaces a leading folder prefix ("A/B" → "A/C") if the path is inside it. */
export function replacePrefix(relPath: string, from: string, to: string): string | null {
  if (relPath === from) return to;
  if (relPath.startsWith(`${from}/`)) return to + relPath.slice(from.length);
  return null;
}

// Windows forbids these in names, plus trailing dots/spaces and reserved device names.
const INVALID_CHARS = /[<>:"/\\|?*]/;
const hasControlChars = (s: string) => [...s].some((c) => c.charCodeAt(0) < 32);
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export type NameError = "empty" | "invalidChars" | "reserved" | "service" | "tooLong";

export function validateName(name: string, { allowService = false } = {}): NameError | null {
  const trimmed = name.trim();
  if (trimmed === "") return "empty";
  if (trimmed.length > 120) return "tooLong";
  if (INVALID_CHARS.test(trimmed) || hasControlChars(trimmed) || /[. ]$/.test(trimmed)) {
    return "invalidChars";
  }
  if (RESERVED.test(trimmed)) return "reserved";
  if (!allowService && isServiceName(trimmed)) return "service";
  return null;
}

/** "lich.png" → "lich (2).png" etc., comparing case-insensitively like Windows does. */
export function suggestFreeName(fileName: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(fileName.toLowerCase())) return fileName;
  const { base, ext } = splitExtension(fileName);
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
