// Pure edits of a campaign's relation graph. Every function returns a new graph
// and keeps unchanged entities by reference, so a diff can find what to save.
import type { Character, Faction, Relation, RelationGraph } from "./types";

export type CharacterPatch = Partial<Omit<Character, "id" | "campaignId" | "createdAt">>;
export type FactionPatch = Partial<Omit<Faction, "id" | "campaignId" | "createdAt">>;
export type RelationPatch = Partial<Omit<Relation, "id" | "campaignId" | "createdAt">>;

export interface Point {
  x: number;
  y: number;
}

function patchList<T extends { id: string; updatedAt: string }>(
  list: readonly T[],
  id: string,
  patch: Partial<T>,
  now: string,
): readonly T[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.id !== id) return item;
    const keys = Object.keys(patch) as (keyof T)[];
    if (keys.every((k) => sameValue(item[k], patch[k]))) return item;
    changed = true;
    return { ...item, ...patch, updatedAt: now };
  });
  return changed ? next : list;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

export function addCharacter(graph: RelationGraph, character: Character): RelationGraph {
  return { ...graph, characters: [...graph.characters, character] };
}

export function updateCharacter(
  graph: RelationGraph,
  id: string,
  patch: CharacterPatch,
  now: string,
): RelationGraph {
  const characters = patchList<Character>(graph.characters, id, patch, now);
  return characters === graph.characters ? graph : { ...graph, characters };
}

/** Removes the character with every relation it is an end of. */
export function removeCharacter(graph: RelationGraph, id: string): RelationGraph {
  return {
    ...graph,
    characters: graph.characters.filter((c) => c.id !== id),
    relations: graph.relations.filter((r) => r.fromId !== id && r.toId !== id),
  };
}

export function addFaction(graph: RelationGraph, faction: Faction): RelationGraph {
  return { ...graph, factions: [...graph.factions, faction] };
}

export function updateFaction(
  graph: RelationGraph,
  id: string,
  patch: FactionPatch,
  now: string,
): RelationGraph {
  const factions = patchList<Faction>(graph.factions, id, patch, now);
  return factions === graph.factions ? graph : { ...graph, factions };
}

/** Removes the faction, its relations and its membership of characters (who stay on the graph). */
export function removeFaction(graph: RelationGraph, id: string, now: string): RelationGraph {
  return {
    characters: graph.characters.map((c) =>
      c.factionIds.includes(id)
        ? { ...c, factionIds: c.factionIds.filter((f) => f !== id), updatedAt: now }
        : c,
    ),
    factions: graph.factions.filter((f) => f.id !== id),
    relations: graph.relations.filter((r) => r.fromId !== id && r.toId !== id),
  };
}

export function addRelation(graph: RelationGraph, relation: Relation): RelationGraph {
  return { ...graph, relations: [...graph.relations, relation] };
}

export function updateRelation(
  graph: RelationGraph,
  id: string,
  patch: RelationPatch,
  now: string,
): RelationGraph {
  const relations = patchList<Relation>(graph.relations, id, patch, now);
  return relations === graph.relations ? graph : { ...graph, relations };
}

export function removeRelation(graph: RelationGraph, id: string): RelationGraph {
  return { ...graph, relations: graph.relations.filter((r) => r.id !== id) };
}

/** Moves characters and factions (by id) to new top-left positions. */
export function moveNodes(
  graph: RelationGraph,
  positions: ReadonlyMap<string, Point>,
  now: string,
): RelationGraph {
  const move = <T extends { id: string; x: number; y: number }>(item: T): T => {
    const p = positions.get(item.id);
    return p && (p.x !== item.x || p.y !== item.y)
      ? { ...item, x: p.x, y: p.y, updatedAt: now }
      : item;
  };
  const characters = graph.characters.map(move);
  const factions = graph.factions.map(move);
  const same = (a: readonly unknown[], b: readonly unknown[]) => a.every((v, i) => v === b[i]);
  if (same(characters, graph.characters) && same(factions, graph.factions)) return graph;
  return { ...graph, characters, factions };
}

/** Makes `factionId` the main faction of the character (adding it if needed). */
export function withMainFaction(factionIds: readonly string[], factionId: string): string[] {
  return [factionId, ...factionIds.filter((f) => f !== factionId)];
}

export function nodeName(graph: RelationGraph, id: string): string | null {
  return (
    graph.characters.find((c) => c.id === id)?.name ??
    graph.factions.find((f) => f.id === id)?.name ??
    null
  );
}
