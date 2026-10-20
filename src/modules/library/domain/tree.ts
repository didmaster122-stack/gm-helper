import { buildCatalogTree } from "../../../shared/catalog/tree";
import type { Art } from "./types";

export interface GroupNode {
  name: string;
  count: number;
}

export interface SystemNode {
  name: string;
  /** All present arts of the system, including unsorted ones inside it. */
  count: number;
  groups: GroupNode[];
}

export interface LibraryTree {
  systems: SystemNode[];
  total: number;
  unsorted: number;
  missing: number;
}

/** Systems and groups come from folders on disk (so empty ones show up) and from the arts. */
export function buildTree(folders: readonly string[], arts: readonly Art[]): LibraryTree {
  const { tops, ...counts } = buildCatalogTree(
    folders,
    arts.map((a) => ({ ...a, top: a.system, sub: a.group })),
  );
  return { ...counts, systems: tops.map(({ subs, ...t }) => ({ ...t, groups: subs })) };
}
