// Music use cases: file system + index. UI and state live in store.ts.
import { planImport, type ImportItem } from "../../shared/catalog/importPlan";
import {
  joinRel,
  parentRel,
  replacePrefix,
  splitExtension,
  toAbsolute,
} from "../../shared/catalog/paths";
import { filesToInspect, hasChanges } from "../../shared/catalog/reconcile";
import { getDb } from "../../shared/db";
import {
  copyNewFile,
  createFolder,
  inspectFiles,
  listNames,
  movePath,
  moveToTrash,
  removeEmptyFolder,
  scanLibrary,
} from "../../shared/fs";
import {
  AUDIO_EXTENSIONS,
  isSupportedAudio,
  planTrackScan,
  relocateTrack,
  resolveTrackScan,
} from "./domain/tracks";
import type { Track, TrackInspection } from "./domain/types";
import * as repo from "./repo";

/** Audio files are big; small batches keep the progress moving. */
const INSPECT_BATCH = 8;

export interface SyncResult {
  tracks: Track[];
  folders: string[];
  errors: string[];
}

export type Progress = (done: number, total: number) => void;

/** Brings the index in line with the disk. Unchanged files are not re-read. */
export async function syncMusic(root: string, onProgress?: Progress): Promise<SyncResult> {
  const db = await getDb();
  const [scan, existing] = await Promise.all([
    scanLibrary(root, AUDIO_EXTENSIONS),
    repo.listTracks(db),
  ]);
  const plan = planTrackScan(existing, scan.files);
  const toInspect = filesToInspect(plan);

  const inspected = new Map<string, TrackInspection>();
  const errors = [...scan.errors];
  onProgress?.(0, toInspect.length);
  for (let i = 0; i < toInspect.length; i += INSPECT_BATCH) {
    const batch = toInspect.slice(i, i + INSPECT_BATCH);
    const infos = await inspectFiles(batch.map((f) => toAbsolute(root, f.relPath)));
    infos.forEach((info, j) => {
      const file = batch[j];
      if (!file) return;
      if (info.error) errors.push(`${file.relPath}: ${info.error}`);
      inspected.set(file.relPath, { hash: info.hash });
    });
    onProgress?.(Math.min(i + INSPECT_BATCH, toInspect.length), toInspect.length);
  }

  const now = new Date().toISOString();
  const changes = resolveTrackScan(plan, inspected, { now, newId: () => crypto.randomUUID() });
  if (hasChanges(changes)) await repo.applyTrackScan(db, changes, now);
  return { tracks: await repo.listTracks(db), folders: scan.folders, errors };
}

export async function saveDurations(durations: ReadonlyMap<string, number>): Promise<void> {
  if (durations.size > 0) await repo.saveDurations(await getDb(), durations);
}

// Folders (categories and collections)

export async function createMusicFolder(root: string, relPath: string): Promise<void> {
  await createFolder(toAbsolute(root, relPath));
}

/** Renames a category or collection folder and rewrites paths of the tracks inside it. */
export async function renameMusicFolder(
  root: string,
  relPath: string,
  newName: string,
  tracks: readonly Track[],
): Promise<void> {
  const target = joinRel(parentRel(relPath), newName);
  await movePath(toAbsolute(root, relPath), toAbsolute(root, target));
  const now = new Date().toISOString();
  const moved = tracks.flatMap((t) => {
    const path = replacePrefix(t.relPath, relPath, target);
    return path === null ? [] : [relocateTrack(t, path, now)];
  });
  await repo.saveTracks(await getDb(), moved);
}

/** Tracks whose files are inside the folder (for the delete confirmation). */
export function tracksInFolder(relPath: string, tracks: readonly Track[]): Track[] {
  return tracks.filter((t) => !t.missing && replacePrefix(t.relPath, relPath, "") !== null);
}

/** Empty folders are removed; non-empty ones go to the recycle bin with their records. */
export async function deleteMusicFolder(
  root: string,
  relPath: string,
  tracks: readonly Track[],
): Promise<void> {
  const abs = toAbsolute(root, relPath);
  if ((await listNames(abs)).length === 0) await removeEmptyFolder(abs);
  else await moveToTrash([abs]);
  const inside = tracks.filter((t) => replacePrefix(t.relPath, relPath, "") !== null);
  await repo.deleteTracks(
    await getDb(),
    inside.map((t) => t.id),
  );
}

// Tracks

/** Renames the file, keeping its extension. */
export async function renameTrack(root: string, track: Track, newBaseName: string) {
  const { ext } = splitExtension(track.fileName);
  return relocate(root, track, joinRel(parentRel(track.relPath), `${newBaseName.trim()}${ext}`));
}

export async function moveTrack(root: string, track: Track, category: string, collection: string) {
  return relocate(root, track, joinRel(category, collection, track.fileName));
}

async function relocate(root: string, track: Track, target: string): Promise<Track> {
  if (target === track.relPath) return track;
  await movePath(toAbsolute(root, track.relPath), toAbsolute(root, target));
  const updated = relocateTrack(track, target, new Date().toISOString());
  await repo.saveTracks(await getDb(), [updated]);
  return updated;
}

/** The file goes to the recycle bin; the record is removed. */
export async function deleteTrack(root: string, track: Track): Promise<void> {
  if (!track.missing) await moveToTrash([toAbsolute(root, track.relPath)]);
  await repo.deleteTracks(await getDb(), [track.id]);
}

export async function saveTrackMeta(
  track: Track,
  meta: { displayName: string | null; tags: string[] },
): Promise<Track> {
  const displayName = meta.displayName?.trim() || null;
  const tags = [...new Set(meta.tags.map((t) => t.trim()).filter(Boolean))];
  const updated = { ...track, displayName, tags, updatedAt: new Date().toISOString() };
  await repo.saveTracks(await getDb(), [updated]);
  return updated;
}

// Import

export async function prepareImport(
  root: string,
  folderRel: string,
  sources: readonly string[],
): Promise<ImportItem[]> {
  return planImport(sources, await listNames(toAbsolute(root, folderRel)), isSupportedAudio);
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
