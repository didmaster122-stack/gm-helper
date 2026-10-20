import { buildSearchText, scoreText, tokenize } from "../../../shared/search/text";
import type { Character, Relation, RelationGraph } from "./types";

export interface GraphFilter {
  /** Shown relation types; null = all. */
  typeIds: ReadonlySet<string> | null;
  /** Show only members of these factions (and the factions); null = all. */
  factionIds: ReadonlySet<string> | null;
  hideDead: boolean;
  /** Only player characters and what they are directly related to. */
  onlyPcs: boolean;
}

export const noFilter: GraphFilter = {
  typeIds: null,
  factionIds: null,
  hideDead: false,
  onlyPcs: false,
};

export function isFiltered(f: GraphFilter): boolean {
  return f.typeIds !== null || f.factionIds !== null || f.hideDead || f.onlyPcs;
}

export interface VisibleGraph {
  characters: ReadonlySet<string>;
  factions: ReadonlySet<string>;
  relations: ReadonlySet<string>;
}

/** Ids of what the graph shows with the filter applied (spec §4.4). */
export function visibleGraph(graph: RelationGraph, filter: GraphFilter): VisibleGraph {
  let characters = graph.characters.filter(
    (c) =>
      !(filter.hideDead && c.status === "dead") &&
      (filter.factionIds === null || c.factionIds.some((f) => filter.factionIds?.has(f))),
  );
  let factions = graph.factions.filter(
    (f) => filter.factionIds === null || filter.factionIds.has(f.id),
  );
  let relations = graph.relations.filter(
    (r) => filter.typeIds === null || filter.typeIds.has(r.typeId),
  );

  const nodeIds = () => new Set([...characters.map((c) => c.id), ...factions.map((f) => f.id)]);
  let nodes = nodeIds();

  if (filter.onlyPcs) {
    const pcs = new Set(characters.filter((c) => c.kind === "pc").map((c) => c.id));
    relations = relations.filter(
      (r) => nodes.has(r.fromId) && nodes.has(r.toId) && (pcs.has(r.fromId) || pcs.has(r.toId)),
    );
    const linked = new Set(relations.flatMap((r) => [r.fromId, r.toId]));
    characters = characters.filter((c) => pcs.has(c.id) || linked.has(c.id));
    const mainFactions = new Set(characters.flatMap((c) => c.factionIds.slice(0, 1)));
    factions = factions.filter((f) => linked.has(f.id) || mainFactions.has(f.id));
    nodes = nodeIds();
  }

  return {
    characters: new Set(characters.map((c) => c.id)),
    factions: new Set(factions.map((f) => f.id)),
    relations: new Set(
      relations.filter((r) => nodes.has(r.fromId) && nodes.has(r.toId)).map((r) => r.id),
    ),
  };
}

export interface SearchHit {
  id: string;
  kind: "character" | "faction";
  name: string;
}

/** Characters (by name, role, player, tags) and factions (by name) matching the query, best first. */
export function searchGraph(graph: RelationGraph, query: string, limit = 12): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored: (SearchHit & { score: number })[] = [];
  for (const c of graph.characters) {
    const score = scoreText(tokens, buildSearchText([c.name, c.role, c.player, ...c.tags]));
    if (score > 0) scored.push({ id: c.id, kind: "character", name: c.name, score });
  }
  for (const f of graph.factions) {
    const score = scoreText(tokens, buildSearchText([f.name]));
    if (score > 0) scored.push({ id: f.id, kind: "faction", name: f.name, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"))
    .slice(0, limit)
    .map(({ id, kind, name }) => ({ id, kind, name }));
}

export interface SplitRelations {
  /** Drawn as lines. */
  drawn: Relation[];
  /**
   * Relations between a character and its main faction (the frame it is drawn in),
   * by character id. They are shown as labels on the character instead of arrows.
   */
  inner: Map<string, Relation[]>;
}

export function splitInnerRelations(
  relations: readonly Relation[],
  characters: readonly Pick<Character, "id" | "factionIds">[],
): SplitRelations {
  const mainFaction = new Map(characters.map((c) => [c.id, c.factionIds[0]]));
  const drawn: Relation[] = [];
  const inner = new Map<string, Relation[]>();
  for (const r of relations) {
    const character =
      mainFaction.get(r.fromId) === r.toId
        ? r.fromId
        : mainFaction.get(r.toId) === r.fromId
          ? r.toId
          : null;
    if (character === null) {
      drawn.push(r);
      continue;
    }
    const list = inner.get(character);
    if (list) list.push(r);
    else inner.set(character, [r]);
  }
  return { drawn, inner };
}
