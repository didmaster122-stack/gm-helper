// Two-level folder tree with counts, built from folders on disk and indexed files.

export interface SubNode {
  name: string;
  count: number;
}

export interface TopNode {
  name: string;
  /** All present files under the folder, including unsorted ones inside it. */
  count: number;
  subs: SubNode[];
}

export interface CatalogTree {
  tops: TopNode[];
  total: number;
  unsorted: number;
  missing: number;
}

/** What the tree needs to know about a file. */
export interface TreeItem {
  relPath: string;
  top: string | null;
  sub: string | null;
  unsorted: boolean;
  missing: boolean;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "ru", { numeric: true });

/** Folders come from disk (so empty ones show up) and from the files. */
export function buildCatalogTree(
  folders: readonly string[],
  items: Iterable<TreeItem>,
): CatalogTree {
  const tops = new Map<string, { count: number; subs: Map<string, number> }>();
  const top = (name: string) => {
    let node = tops.get(name);
    if (!node) tops.set(name, (node = { count: 0, subs: new Map() }));
    return node;
  };

  for (const folder of folders) {
    const [t, s] = folder.split("/");
    if (!t) continue;
    const node = top(t);
    if (s && !node.subs.has(s)) node.subs.set(s, 0);
  }

  const tree: CatalogTree = { tops: [], total: 0, unsorted: 0, missing: 0 };
  for (const item of items) {
    if (item.missing) {
      tree.missing++;
      continue;
    }
    tree.total++;
    if (item.unsorted) tree.unsorted++;
    // Files lying directly in the root have no top folder.
    if (item.top === null || (item.sub === null && !item.relPath.includes("/"))) continue;
    const node = top(item.top);
    node.count++;
    if (!item.unsorted && item.sub !== null) {
      node.subs.set(item.sub, (node.subs.get(item.sub) ?? 0) + 1);
    }
  }

  tree.tops = [...tops]
    .map(([name, node]) => ({
      name,
      count: node.count,
      subs: [...node.subs].map(([s, count]) => ({ name: s, count })).sort(byName),
    }))
    .sort(byName);
  return tree;
}
