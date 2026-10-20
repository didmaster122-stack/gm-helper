import { suggestFreeName } from "./paths";

export interface ImportItem {
  /** Absolute path of the dropped file. */
  source: string;
  fileName: string;
  /** Free name in the target folder (equals fileName when there is no conflict). */
  targetName: string;
  conflict: boolean;
  unsupported: boolean;
}

export function baseName(absPath: string): string {
  const parts = absPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? absPath;
}

/** Decides target names for files copied into a folder that already contains `existing`. */
export function planImport(
  sources: readonly string[],
  existing: readonly string[],
  isSupported: (fileName: string) => boolean,
): ImportItem[] {
  const taken = [...existing];
  return sources.map((source) => {
    const fileName = baseName(source);
    if (!isSupported(fileName)) {
      return { source, fileName, targetName: fileName, conflict: false, unsupported: true };
    }
    const targetName = suggestFreeName(fileName, taken);
    taken.push(targetName);
    return { source, fileName, targetName, conflict: targetName !== fileName, unsupported: false };
  });
}
