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

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "ru", { numeric: true });

/** Systems and groups come from folders on disk (so empty ones show up) and from the arts. */
export function buildTree(folders: readonly string[], arts: readonly Art[]): LibraryTree {
  const systems = new Map<string, { count: number; groups: Map<string, number> }>();
  const system = (name: string) => {
    let node = systems.get(name);
    if (!node) systems.set(name, (node = { count: 0, groups: new Map() }));
    return node;
  };

  for (const folder of folders) {
    const [s, g] = folder.split("/");
    if (!s) continue;
    const node = system(s);
    if (g && !node.groups.has(g)) node.groups.set(g, 0);
  }

  const tree: LibraryTree = { systems: [], total: 0, unsorted: 0, missing: 0 };
  for (const art of arts) {
    if (art.missing) {
      tree.missing++;
      continue;
    }
    tree.total++;
    if (art.unsorted) tree.unsorted++;
    // Files lying directly in the root have no system.
    if (art.system === null || (art.group === null && !art.relPath.includes("/"))) continue;
    const node = system(art.system);
    node.count++;
    if (!art.unsorted && art.group !== null) {
      node.groups.set(art.group, (node.groups.get(art.group) ?? 0) + 1);
    }
  }

  tree.systems = [...systems]
    .map(([name, node]) => ({
      name,
      count: node.count,
      groups: [...node.groups].map(([g, count]) => ({ name: g, count })).sort(byName),
    }))
    .sort(byName);
  return tree;
}
