import { runScript, sqlLiteral as lit } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
import { classifyPath } from "./domain/paths";
import type { ScanChanges } from "./domain/reconcile";
import type { Art } from "./domain/types";

interface ArtRow {
  id: string;
  rel_path: string;
  system: string | null;
  grp: string | null;
  unsorted: number;
  file_name: string;
  size: number;
  mtime: number;
  hash: string | null;
  width: number | null;
  height: number | null;
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

function fromRow(r: ArtRow): Art {
  return {
    id: r.id,
    relPath: r.rel_path,
    system: r.system,
    group: r.grp,
    unsorted: r.unsorted !== 0,
    fileName: r.file_name,
    size: r.size,
    mtime: r.mtime,
    hash: r.hash,
    width: r.width,
    height: r.height,
    displayName: r.display_name,
    tags: parseTags(r.tags),
    missing: r.missing !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function insertSql(a: Art): string {
  return `INSERT INTO arts (id, rel_path, system, grp, unsorted, file_name, size, mtime, hash, width, height,
      display_name, tags, missing, created_at, updated_at)
    VALUES (${[
      a.id,
      a.relPath,
      a.system,
      a.group,
      a.unsorted,
      a.fileName,
      a.size,
      a.mtime,
      a.hash,
      a.width,
      a.height,
      a.displayName,
      JSON.stringify(a.tags),
      a.missing,
      a.createdAt,
      a.updatedAt,
    ]
      .map(lit)
      .join(", ")})`;
}

function updateSql(a: Art): string {
  return `UPDATE arts SET rel_path = ${lit(a.relPath)}, system = ${lit(a.system)}, grp = ${lit(a.group)},
      unsorted = ${lit(a.unsorted)}, file_name = ${lit(a.fileName)}, size = ${lit(a.size)},
      mtime = ${lit(a.mtime)}, hash = ${lit(a.hash)}, width = ${lit(a.width)}, height = ${lit(a.height)},
      display_name = ${lit(a.displayName)}, tags = ${lit(JSON.stringify(a.tags))},
      missing = ${lit(a.missing)}, updated_at = ${lit(a.updatedAt)}
    WHERE id = ${lit(a.id)}`;
}

/**
 * Updates whose new path is still held by another updated record would hit the
 * UNIQUE constraint mid-batch (e.g. swapping two names), so paths are first
 * moved to unique placeholders.
 */
function updatesSql(updates: readonly Art[]): string[] {
  if (updates.length === 0) return [];
  const ids = updates.map((a) => lit(a.id)).join(", ");
  return [
    `UPDATE arts SET rel_path = '\u0001' || id WHERE id IN (${ids})`,
    ...updates.map(updateSql),
  ];
}

export async function listArts(db: Db): Promise<Art[]> {
  return (await db.select<ArtRow>("SELECT * FROM arts")).map(fromRow);
}

export async function applyScanChanges(db: Db, changes: ScanChanges, now: string): Promise<void> {
  const missing = changes.markMissing.length
    ? [
        `UPDATE arts SET missing = 1, updated_at = ${lit(now)} WHERE id IN (${changes.markMissing
          .map(lit)
          .join(", ")})`,
      ]
    : [];
  // One script: a partial chunked apply could leave a moved record and its old copy both present.
  await runScript(
    db,
    [...updatesSql(changes.updates), ...changes.inserts.map(insertSql), ...missing],
    Number.MAX_SAFE_INTEGER,
  );
}

/** Saves records changed by the app itself (rename, move, metadata). */
export async function saveArts(db: Db, arts: readonly Art[]): Promise<void> {
  await runScript(db, updatesSql(arts), Number.MAX_SAFE_INTEGER);
}

export async function insertArts(db: Db, arts: readonly Art[]): Promise<void> {
  await runScript(db, arts.map(insertSql));
}

export async function deleteArts(db: Db, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await runScript(db, [`DELETE FROM arts WHERE id IN (${ids.map(lit).join(", ")})`]);
}

/** Copy of the art at a new relative path, with location fields recomputed. */
export function relocate(art: Art, relPath: string, now: string): Art {
  return { ...art, ...classifyPath(relPath), relPath, updatedAt: now };
}
