// The only place that talks to the file system directly (see CLAUDE.md).
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir } from "@tauri-apps/plugin-fs";

/** Folders starting with "_" or "." are service folders, not systems or groups. */
export function isServiceFolderName(name: string): boolean {
  return name.startsWith("_") || name.startsWith(".");
}

export async function pickDirectory(title: string, defaultPath?: string): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title, defaultPath });
  return typeof result === "string" ? result : null;
}

export function pathExists(path: string): Promise<boolean> {
  return exists(path);
}

/** Names of visible subfolders, sorted for display. */
export async function listSubfolders(path: string): Promise<string[]> {
  const entries = await readDir(path);
  return entries
    .filter((e) => e.isDirectory && !isServiceFolderName(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "ru"));
}
