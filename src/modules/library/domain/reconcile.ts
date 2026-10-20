import { classifyPath } from "./paths";
import type { Art, FileInspection, FoundFile } from "./types";

/**
 * Library sync in two pure steps around the (slow) hashing of files:
 *   1. planScan   — compare disk with the index by path, size and mtime;
 *   2. resolveScan — with hashes of new/changed files, detect moves and renames
 *                    by content hash and produce database changes.
 */

export interface ScanPlan {
  /** Existing records whose file is unchanged on disk. */
  unchanged: Art[];
  /** Existing records whose file changed (size/mtime) or was never hashed. */
  changed: { art: Art; file: FoundFile }[];
  /** Paths with no record yet. */
  added: FoundFile[];
  /** Records whose path is no longer on disk (including ones already marked missing). */
  vanished: Art[];
}

export function planScan(existing: readonly Art[], found: readonly FoundFile[]): ScanPlan {
  const byPath = new Map(existing.map((a) => [a.relPath, a]));
  const seen = new Set<string>();
  const plan: ScanPlan = { unchanged: [], changed: [], added: [], vanished: [] };

  for (const file of found) {
    seen.add(file.relPath);
    const art = byPath.get(file.relPath);
    if (!art) plan.added.push(file);
    else if (art.size !== file.size || art.mtime !== file.mtime || art.hash === null) {
      plan.changed.push({ art, file });
    } else plan.unchanged.push(art);
  }
  for (const art of existing) {
    if (!seen.has(art.relPath)) plan.vanished.push(art);
  }
  return plan;
}

/** Files that need hashing before resolveScan. */
export function filesToInspect(plan: ScanPlan): FoundFile[] {
  return [...plan.changed.map((c) => c.file), ...plan.added];
}

export interface ScanChanges {
  inserts: Art[];
  /** Full new state of changed records (same id). */
  updates: Art[];
  markMissing: string[];
}

export interface ResolveContext {
  now: string;
  newId: () => string;
}

function withFile(art: Art, file: FoundFile, info: FileInspection | undefined, now: string): Art {
  const location = classifyPath(file.relPath);
  return {
    ...art,
    ...location,
    relPath: file.relPath,
    size: file.size,
    mtime: file.mtime,
    hash: info?.hash ?? art.hash,
    width: info?.width ?? art.width,
    height: info?.height ?? art.height,
    missing: false,
    updatedAt: now,
  };
}

export function resolveScan(
  plan: ScanPlan,
  inspected: ReadonlyMap<string, FileInspection>,
  ctx: ResolveContext,
): ScanChanges {
  const changes: ScanChanges = { inserts: [], updates: [], markMissing: [] };

  // Unchanged files whose record was marked missing came back at the same path.
  for (const art of plan.unchanged) {
    if (art.missing) changes.updates.push({ ...art, missing: false, updatedAt: ctx.now });
  }
  for (const { art, file } of plan.changed) {
    changes.updates.push(withFile(art, file, inspected.get(file.relPath), ctx.now));
  }

  // Vanished records can be claimed by a new file with the same content (move/rename).
  const candidates = new Map<string, Art[]>();
  for (const art of plan.vanished) {
    if (!art.hash) continue;
    const list = candidates.get(art.hash) ?? [];
    list.push(art);
    candidates.set(art.hash, list);
  }
  const claimed = new Set<string>();
  const matched = new Set<FoundFile>();

  const claim = (file: FoundFile, sameNameOnly: boolean) => {
    const info = inspected.get(file.relPath);
    const pool = info?.hash ? candidates.get(info.hash) : undefined;
    if (!pool || pool.length === 0) return;
    const name = classifyPath(file.relPath).fileName.toLowerCase();
    const index = sameNameOnly ? pool.findIndex((a) => a.fileName.toLowerCase() === name) : 0;
    if (index < 0) return;
    const [art] = pool.splice(index, 1);
    if (!art) return;
    claimed.add(art.id);
    matched.add(file);
    changes.updates.push(withFile(art, file, info, ctx.now));
  };

  // A file with the same name is a move; give those records out first, then renames.
  for (const file of plan.added) claim(file, true);
  for (const file of plan.added) if (!matched.has(file)) claim(file, false);

  for (const file of plan.added) {
    if (matched.has(file)) continue;
    const info = inspected.get(file.relPath);
    changes.inserts.push({
      id: ctx.newId(),
      ...classifyPath(file.relPath),
      relPath: file.relPath,
      size: file.size,
      mtime: file.mtime,
      hash: info?.hash ?? null,
      width: info?.width ?? null,
      height: info?.height ?? null,
      displayName: null,
      tags: [],
      missing: false,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  for (const art of plan.vanished) {
    if (!claimed.has(art.id) && !art.missing) changes.markMissing.push(art.id);
  }
  return changes;
}

export function hasChanges(changes: ScanChanges): boolean {
  return changes.inserts.length + changes.updates.length + changes.markMissing.length > 0;
}
