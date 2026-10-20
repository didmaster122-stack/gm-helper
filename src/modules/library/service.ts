// Library use cases: file system + index. UI and state live in store.ts.
import { getDb } from "../../shared/db";
import {
  copyNewFile,
  createFolder,
  inspectFiles,
  listNames,
  moveToTrash,
  movePath,
  removeEmptyFolder,
  scanLibrary,
} from "../../shared/fs";
import { planImport, type ImportItem } from "./domain/importPlan";
import {
  IMAGE_EXTENSIONS,
  joinRel,
  parentRel,
  replacePrefix,
  splitExtension,
  toAbsolute,
} from "./domain/paths";
import { filesToInspect, hasChanges, planScan, resolveScan } from "./domain/reconcile";
import type { Art, FileInspection } from "./domain/types";
import * as repo from "./repo";

const INSPECT_BATCH = 40;

export interface SyncResult {
  arts: Art[];
  folders: string[];
  errors: string[];
}

export type Progress = (done: number, total: number) => void;

/** Brings the index in line with the disk. Unchanged files are not re-read. */
export async function syncLibrary(root: string, onProgress?: Progress): Promise<SyncResult> {
  const db = await getDb();
  const [scan, existing] = await Promise.all([
    scanLibrary(root, IMAGE_EXTENSIONS),
    repo.listArts(db),
  ]);
  const plan = planScan(existing, scan.files);
  const toInspect = filesToInspect(plan);

  const inspected = new Map<string, FileInspection>();
  const errors = [...scan.errors];
  onProgress?.(0, toInspect.length);
  for (let i = 0; i < toInspect.length; i += INSPECT_BATCH) {
    const batch = toInspect.slice(i, i + INSPECT_BATCH);
    const infos = await inspectFiles(batch.map((f) => toAbsolute(root, f.relPath)));
    infos.forEach((info, j) => {
      const file = batch[j];
      if (!file) return;
      if (info.error) errors.push(`${file.relPath}: ${info.error}`);
      inspected.set(file.relPath, { hash: info.hash, width: info.width, height: info.height });
    });
    onProgress?.(Math.min(i + INSPECT_BATCH, toInspect.length), toInspect.length);
  }

  const now = new Date().toISOString();
  const changes = resolveScan(plan, inspected, { now, newId: () => crypto.randomUUID() });
  if (hasChanges(changes)) await repo.applyScanChanges(db, changes, now);

  return { arts: await repo.listArts(db), folders: scan.folders, errors };
}

// Folders (systems and groups)

export async function createLibraryFolder(root: string, relPath: string): Promise<void> {
  await createFolder(toAbsolute(root, relPath));
}

/** Renames a system or group folder and rewrites paths of the arts inside it. */
export async function renameLibraryFolder(
  root: string,
  relPath: string,
  newName: string,
  arts: readonly Art[],
): Promise<void> {
  const target = joinRel(parentRel(relPath), newName);
  await movePath(toAbsolute(root, relPath), toAbsolute(root, target));
  const now = new Date().toISOString();
  const moved = arts.flatMap((art) => {
    const path = replacePrefix(art.relPath, relPath, target);
    return path === null ? [] : [repo.relocate(art, path, now)];
  });
  await repo.saveArts(await getDb(), moved);
}

/** Arts whose files are inside the folder (for the delete confirmation). */
export function artsInFolder(relPath: string, arts: readonly Art[]): Art[] {
  return arts.filter((a) => !a.missing && replacePrefix(a.relPath, relPath, "") !== null);
}

/** Empty folders are removed; non-empty ones go to the recycle bin with their records. */
export async function deleteLibraryFolder(
  root: string,
  relPath: string,
  arts: readonly Art[],
): Promise<void> {
  const abs = toAbsolute(root, relPath);
  const inside = arts.filter((a) => replacePrefix(a.relPath, relPath, "") !== null);
  if ((await listNames(abs)).length === 0) await removeEmptyFolder(abs);
  else await moveToTrash([abs]);
  await repo.deleteArts(
    await getDb(),
    inside.map((a) => a.id),
  );
}

// Arts

/** Renames the file, keeping its extension. Tokens follow in stage 2. */
export async function renameArt(root: string, art: Art, newBaseName: string): Promise<Art> {
  const { ext } = splitExtension(art.fileName);
  const target = joinRel(parentRel(art.relPath), `${newBaseName.trim()}${ext}`);
  return relocateArt(root, art, target);
}

export async function moveArt(root: string, art: Art, system: string, group: string): Promise<Art> {
  return relocateArt(root, art, joinRel(system, group, art.fileName));
}

async function relocateArt(root: string, art: Art, target: string): Promise<Art> {
  if (target === art.relPath) return art;
  await movePath(toAbsolute(root, art.relPath), toAbsolute(root, target));
  const updated = repo.relocate(art, target, new Date().toISOString());
  await repo.saveArts(await getDb(), [updated]);
  return updated;
}

export async function deleteArt(root: string, art: Art): Promise<void> {
  if (!art.missing) await moveToTrash([toAbsolute(root, art.relPath)]);
  await repo.deleteArts(await getDb(), [art.id]);
}

export async function saveArtMeta(
  art: Art,
  meta: { displayName: string | null; tags: string[] },
): Promise<Art> {
  const displayName = meta.displayName?.trim() || null;
  const tags = [...new Set(meta.tags.map((t) => t.trim()).filter(Boolean))];
  const updated = { ...art, displayName, tags, updatedAt: new Date().toISOString() };
  await repo.saveArts(await getDb(), [updated]);
  return updated;
}

// Import

export async function prepareImport(
  root: string,
  folderRel: string,
  sources: readonly string[],
): Promise<ImportItem[]> {
  return planImport(sources, await listNames(toAbsolute(root, folderRel)));
}

/** Copies files into the folder; conflicting ones are copied under their free name or skipped. */
export async function runImport(
  root: string,
  folderRel: string,
  items: readonly ImportItem[],
  renameConflicts: boolean,
): Promise<{ copied: number; failed: string[] }> {
  let copied = 0;
  const failed: string[] = [];
  for (const item of items) {
    if (item.unsupported || (item.conflict && !renameConflicts)) continue;
    try {
      await copyNewFile(item.source, toAbsolute(root, joinRel(folderRel, item.targetName)));
      copied++;
    } catch (error) {
      failed.push(`${item.fileName}: ${String(error)}`);
    }
  }
  return { copied, failed };
}
