import type { CatalogEntry, Inspection } from "../../../shared/catalog/reconcile";

/** Audio file in the music folder (spec §6.2). */
export interface Track extends CatalogEntry {
  /** First folder of the path; null for files lying in the root. */
  category: string | null;
  /** Second folder; null when the file is not inside a collection. */
  collection: string | null;
  /** Not in the Category/Collection/file layout. */
  unsorted: boolean;
  /** Null until the file has been read once. */
  durationMs: number | null;
  displayName: string | null;
  tags: string[];
  createdAt: string;
}

export type TrackInspection = Inspection;

export type MusicSelection =
  | { kind: "all" }
  | { kind: "category"; category: string }
  | { kind: "collection"; category: string; collection: string }
  | { kind: "unsorted" }
  | { kind: "missing" };
