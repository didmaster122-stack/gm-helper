// Art links in a campaign backup: collected on export, found in this library on import.
import type { Db } from "../../shared/db/types";
import { pathExists } from "../../shared/fs";
import {
  collectArtRefs,
  resolveArtRefs,
  type ArtRefs,
  type ArtResolution,
  type PictureLink,
} from "./domain/artRefs";
import { toAbsolute } from "./domain/paths";
import * as repo from "./repo";
import { useLibraryStore } from "./store";

export async function collectLibraryRefs(db: Db, links: readonly PictureLink[]): Promise<ArtRefs> {
  const [arts, tokens] = await Promise.all([repo.listArts(db), repo.listTokens(db)]);
  return collectArtRefs(links, arts, tokens);
}

export interface LibraryRestore {
  resolution: ArtResolution;
  /** Inserts of the token records to create, for the import script. */
  statements: string[];
}

/** Finds the arts and tokens of a backup in the library at `root` (null: none chosen). */
export async function resolveLibraryRefs(
  db: Db,
  root: string | null,
  refs: ArtRefs,
  newId: () => string,
): Promise<LibraryRestore> {
  const [arts, tokens] = await Promise.all([repo.listArts(db), repo.listTokens(db)]);
  const known = new Set(tokens.map((t) => t.relPath));
  const onDisk = new Set<string>();
  if (root) {
    for (const t of refs.tokens) {
      if (!known.has(t.relPath) && (await pathExists(toAbsolute(root, t.relPath)))) {
        onDisk.add(t.relPath);
      }
    }
  }
  const resolution = resolveArtRefs(refs, arts, tokens, (p) => onDisk.has(p), newId);
  return { resolution, statements: resolution.newTokens.map(repo.tokenInsertStatement) };
}

/** Re-reads the index after token records were added outside the library screen. */
export async function reloadLibrary(): Promise<void> {
  const { root, sync } = useLibraryStore.getState();
  if (root) await sync();
}
