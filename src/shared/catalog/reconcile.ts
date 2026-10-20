/**
 * Catalog sync in two pure steps around the (slow) hashing of files:
 *   1. planScan   — compare disk with the index by path, size and mtime;
 *   2. resolveScan — with hashes of new/changed files, detect moves and renames
 *                    by content hash and produce database changes.
 * Record types differ per catalog (arts, tracks); an adapter builds and updates them.
 */

/** Fields every indexed file has. */
export interface CatalogEntry {
  id: string;
  /** Relative to the catalog root, "/"-separated. */
  relPath: string;
  fileName: string;
  size: number;
  /** Modification time, ms since epoch. */
  mtime: number;
  /** SHA-256 hex; null if the file could not be read yet. */
  hash: string | null;
  missing: boolean;
  updatedAt: string;
}

/** A file seen on disk during a scan. */
export interface FoundFile {
  relPath: string;
  size: number;
  mtime: number;
}

export interface Inspection {
  hash: string | null;
}

export interface ScanPlan<T> {
  /** Existing records whose file is unchanged on disk. */
  unchanged: T[];
  /** Existing records whose file changed (size/mtime) or was never hashed. */
  changed: { entry: T; file: FoundFile }[];
  /** Paths with no record yet. */
  added: FoundFile[];
  /** Records whose path is no longer on disk (including ones already marked missing). */
  vanished: T[];
}

export function planScan<T extends CatalogEntry>(
  existing: readonly T[],
  found: readonly FoundFile[],
): ScanPlan<T> {
  const byPath = new Map(existing.map((e) => [e.relPath, e]));
  const seen = new Set<string>();
  const plan: ScanPlan<T> = { unchanged: [], changed: [], added: [], vanished: [] };

  for (const file of found) {
    seen.add(file.relPath);
    const entry = byPath.get(file.relPath);
    if (!entry) plan.added.push(file);
    else if (entry.size !== file.size || entry.mtime !== file.mtime || entry.hash === null) {
      plan.changed.push({ entry, file });
    } else plan.unchanged.push(entry);
  }
  for (const entry of existing) {
    if (!seen.has(entry.relPath)) plan.vanished.push(entry);
  }
  return plan;
}

/** Files that need hashing before resolveScan. */
export function filesToInspect<T>(plan: ScanPlan<T>): FoundFile[] {
  return [...plan.changed.map((c) => c.file), ...plan.added];
}

export interface ScanChanges<T> {
  inserts: T[];
  /** Full new state of changed records (same id). */
  updates: T[];
  markMissing: string[];
}

export interface ResolveContext {
  now: string;
  newId: () => string;
}

export interface ReconcileAdapter<T extends CatalogEntry, I extends Inspection> {
  /** The record now describing `file` (same id), with fresh inspection data if any. */
  update(entry: T, file: FoundFile, info: I | undefined, now: string): T;
  /** A new record for a file nobody claimed. */
  create(file: FoundFile, info: I | undefined, ctx: ResolveContext): T;
}

export function resolveScan<T extends CatalogEntry, I extends Inspection>(
  plan: ScanPlan<T>,
  inspected: ReadonlyMap<string, I>,
  ctx: ResolveContext,
  adapter: ReconcileAdapter<T, I>,
): ScanChanges<T> {
  const changes: ScanChanges<T> = { inserts: [], updates: [], markMissing: [] };

  // Unchanged files whose record was marked missing came back at the same path.
  for (const entry of plan.unchanged) {
    if (entry.missing) changes.updates.push({ ...entry, missing: false, updatedAt: ctx.now });
  }
  for (const { entry, file } of plan.changed) {
    changes.updates.push(adapter.update(entry, file, inspected.get(file.relPath), ctx.now));
  }

  // Vanished records can be claimed by a new file with the same content (move/rename).
  const candidates = new Map<string, T[]>();
  for (const entry of plan.vanished) {
    if (!entry.hash) continue;
    const list = candidates.get(entry.hash) ?? [];
    list.push(entry);
    candidates.set(entry.hash, list);
  }
  const claimed = new Set<string>();
  const matched = new Set<FoundFile>();

  const fileNameOf = (relPath: string) => relPath.slice(relPath.lastIndexOf("/") + 1);
  const claim = (file: FoundFile, sameNameOnly: boolean) => {
    const info = inspected.get(file.relPath);
    const pool = info?.hash ? candidates.get(info.hash) : undefined;
    if (!pool || pool.length === 0) return;
    const name = fileNameOf(file.relPath).toLowerCase();
    const index = sameNameOnly ? pool.findIndex((e) => e.fileName.toLowerCase() === name) : 0;
    if (index < 0) return;
    const [entry] = pool.splice(index, 1);
    if (!entry) return;
    claimed.add(entry.id);
    matched.add(file);
    changes.updates.push(adapter.update(entry, file, info, ctx.now));
  };

  // A file with the same name is a move; give those records out first, then renames.
  for (const file of plan.added) claim(file, true);
  for (const file of plan.added) if (!matched.has(file)) claim(file, false);

  for (const file of plan.added) {
    if (matched.has(file)) continue;
    changes.inserts.push(adapter.create(file, inspected.get(file.relPath), ctx));
  }

  for (const entry of plan.vanished) {
    if (!claimed.has(entry.id) && !entry.missing) changes.markMissing.push(entry.id);
  }
  return changes;
}

export function hasChanges<T>(changes: ScanChanges<T>): boolean {
  return changes.inserts.length + changes.updates.length + changes.markMissing.length > 0;
}
