import type { ScanChanges } from "../../shared/catalog/reconcile";
import { runScript, sqlLiteral as lit } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
import type { Track } from "./domain/types";

interface TrackRow {
  id: string;
  rel_path: string;
  category: string | null;
  collection: string | null;
  unsorted: number;
  file_name: string;
  size: number;
  mtime: number;
  hash: string | null;
  duration_ms: number | null;
  display_name: string | null;
  tags: string;
  missing: number;
  created_at: string;
  updated_at: string;
}

function parseTags(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function fromRow(r: TrackRow): Track {
  return {
    id: r.id,
    relPath: r.rel_path,
    category: r.category,
    collection: r.collection,
    unsorted: r.unsorted !== 0,
    fileName: r.file_name,
    size: r.size,
    mtime: r.mtime,
    hash: r.hash,
    durationMs: r.duration_ms,
    displayName: r.display_name,
    tags: parseTags(r.tags),
    missing: r.missing !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function insertSql(t: Track): string {
  return `INSERT INTO tracks (id, rel_path, category, collection, unsorted, file_name, size, mtime, hash,
      duration_ms, display_name, tags, missing, created_at, updated_at)
    VALUES (${[
      t.id,
      t.relPath,
      t.category,
      t.collection,
      t.unsorted,
      t.fileName,
      t.size,
      t.mtime,
      t.hash,
      t.durationMs,
      t.displayName,
      JSON.stringify(t.tags),
      t.missing,
      t.createdAt,
      t.updatedAt,
    ]
      .map(lit)
      .join(", ")})`;
}

function updateSql(t: Track): string {
  return `UPDATE tracks SET rel_path = ${lit(t.relPath)}, category = ${lit(t.category)},
      collection = ${lit(t.collection)}, unsorted = ${lit(t.unsorted)}, file_name = ${lit(t.fileName)},
      size = ${lit(t.size)}, mtime = ${lit(t.mtime)}, hash = ${lit(t.hash)},
      duration_ms = ${lit(t.durationMs)}, display_name = ${lit(t.displayName)},
      tags = ${lit(JSON.stringify(t.tags))}, missing = ${lit(t.missing)}, updated_at = ${lit(t.updatedAt)}
    WHERE id = ${lit(t.id)}`;
}

/** Paths go through unique placeholders first, so swapped names do not hit UNIQUE mid-batch. */
function updatesSql(updates: readonly Track[]): string[] {
  if (updates.length === 0) return [];
  const ids = updates.map((t) => lit(t.id)).join(", ");
  return [
    `UPDATE tracks SET rel_path = '\u0001' || id WHERE id IN (${ids})`,
    ...updates.map(updateSql),
  ];
}

export async function listTracks(db: Db): Promise<Track[]> {
  return (await db.select<TrackRow>("SELECT * FROM tracks")).map(fromRow);
}

export async function applyTrackScan(db: Db, changes: ScanChanges<Track>, now: string) {
  const missing = changes.markMissing.length
    ? [
        `UPDATE tracks SET missing = 1, updated_at = ${lit(now)} WHERE id IN (${changes.markMissing
          .map(lit)
          .join(", ")})`,
      ]
    : [];
  // One script: a partial apply could leave a moved record and its old copy both present.
  await runScript(
    db,
    [...updatesSql(changes.updates), ...changes.inserts.map(insertSql), ...missing],
    Number.MAX_SAFE_INTEGER,
  );
}

/** Saves records changed by the app itself (rename, move, metadata). */
export async function saveTracks(db: Db, tracks: readonly Track[]): Promise<void> {
  await runScript(db, updatesSql(tracks), Number.MAX_SAFE_INTEGER);
}

/** Lengths read from the files; only the duration column changes. */
export async function saveDurations(db: Db, durations: ReadonlyMap<string, number>): Promise<void> {
  await runScript(
    db,
    [...durations].map(
      ([id, ms]) => `UPDATE tracks SET duration_ms = ${lit(Math.round(ms))} WHERE id = ${lit(id)}`,
    ),
  );
}

export async function deleteTracks(db: Db, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(`DELETE FROM tracks WHERE id IN (${ids.map(() => "?").join(", ")})`, ids);
}
