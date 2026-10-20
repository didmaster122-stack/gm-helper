import { hasExtension, locate, splitExtension } from "../../../shared/catalog/paths";
import type { Art } from "./types";

export {
  hasExtension,
  isServiceName,
  joinRel,
  parentRel,
  replacePrefix,
  splitExtension,
  suggestFreeName,
  toAbsolute,
  validateName,
} from "../../../shared/catalog/paths";
export type { NameError } from "../../../shared/catalog/paths";

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export function isSupportedImage(fileName: string): boolean {
  return hasExtension(fileName, IMAGE_EXTENSIONS);
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
  const { top, sub, unsorted, fileName } = locate(relPath);
  return { system: top, group: sub, unsorted, fileName };
}
