import {
  isRecord,
  readBoolean,
  readDate,
  readNullableString,
  readNumber,
  readOneOf,
  readRecords,
  readString,
  readStrings,
} from "../../../shared/parse";
import {
  CHARACTER_KINDS,
  CHARACTER_STATUSES,
  isBuiltinRelationType,
  LINE_STYLES,
  UNKNOWN_TYPE,
  type Character,
  type Faction,
  type Portrait,
  type Relation,
  type RelationGraph,
  type RelationType,
} from "./types";
import { remapMentionText } from "../../../shared/mentions/domain";

/** Relation graph section of a campaign backup. */
export interface GraphBackup {
  characters: Character[];
  factions: Faction[];
  relations: Relation[];
  /** Custom (app-wide) relation types the relations use, so they look the same on another PC. */
  relationTypes: RelationType[];
}

export function toGraphBackup(graph: RelationGraph, types: readonly RelationType[]): GraphBackup {
  const used = new Set(graph.relations.map((r) => r.typeId));
  return {
    characters: [...graph.characters],
    factions: [...graph.factions],
    relations: [...graph.relations],
    relationTypes: types.filter((t) => !t.builtin && used.has(t.id)),
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const readColor = (v: unknown, fallback: string) =>
  typeof v === "string" && HEX_COLOR.test(v) ? v : fallback;

/** Id and name are required; records without them are dropped. */
function readKey(raw: Record<string, unknown>, nameField: string): [string, string] | null {
  const id = readString(raw.id);
  const name = readString(raw[nameField]).trim();
  return id !== "" && name !== "" ? [id, name] : null;
}

function parseCharacter(raw: Record<string, unknown>, now: string): Character | null {
  const key = readKey(raw, "name");
  if (!key) return null;
  return {
    id: key[0],
    campaignId: "",
    name: key[1],
    kind: readOneOf(CHARACTER_KINDS, raw.kind, "npc"),
    player: readString(raw.player),
    role: readString(raw.role),
    status: readOneOf(CHARACTER_STATUSES, raw.status, "unknown"),
    description: readString(raw.description),
    motivation: readString(raw.motivation),
    secrets: readString(raw.secrets),
    tags: readStrings(raw.tags),
    factionIds: readStrings(raw.factionIds),
    artId: readNullableString(raw.artId),
    tokenId: readNullableString(raw.tokenId),
    x: readNumber(raw.x),
    y: readNumber(raw.y),
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function parseFaction(raw: Record<string, unknown>, now: string): Faction | null {
  const key = readKey(raw, "name");
  if (!key) return null;
  return {
    id: key[0],
    campaignId: "",
    name: key[1],
    color: readColor(raw.color, "#8a8c99"),
    description: readString(raw.description),
    artId: readNullableString(raw.artId),
    tokenId: readNullableString(raw.tokenId),
    x: readNumber(raw.x),
    y: readNumber(raw.y),
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function parseRelation(raw: Record<string, unknown>, now: string): Relation | null {
  const id = readString(raw.id);
  const fromId = readString(raw.fromId);
  const toId = readString(raw.toId);
  if (id === "" || fromId === "" || toId === "") return null;
  return {
    id,
    campaignId: "",
    fromId,
    toId,
    typeId: readString(raw.typeId, UNKNOWN_TYPE),
    mutual: readBoolean(raw.mutual),
    label: readString(raw.label),
    note: readString(raw.note),
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function parseRelationType(raw: Record<string, unknown>): RelationType | null {
  const key = readKey(raw, "name");
  if (!key || isBuiltinRelationType(key[0])) return null;
  return {
    id: key[0],
    builtin: false,
    name: key[1],
    color: readColor(raw.color, "#8a8c99"),
    lineStyle: readOneOf(LINE_STYLES, raw.lineStyle, "solid"),
  };
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

/** Reads the section leniently: damaged records are skipped, the rest is kept. */
export function parseGraphBackup(raw: unknown, now: string): GraphBackup {
  const section = isRecord(raw) ? raw : {};
  return {
    characters: readRecords(section.characters)
      .map((r) => parseCharacter(r, now))
      .filter(notNull),
    factions: readRecords(section.factions)
      .map((r) => parseFaction(r, now))
      .filter(notNull),
    relations: readRecords(section.relations)
      .map((r) => parseRelation(r, now))
      .filter(notNull),
    relationTypes: readRecords(section.relationTypes).map(parseRelationType).filter(notNull),
  };
}

export interface RemappedGraph {
  graph: RelationGraph;
  /** Old character id → new id, for the timeline. */
  characterIds: ReadonlyMap<string, string>;
  factionIds: ReadonlyMap<string, string>;
}

/**
 * Gives every entity a new id in the target campaign (so a backup can be imported next to the
 * campaign it was made from), fixes references between them, and replaces portraits via
 * `portrait` (art ids of the backup → arts of this library). Relations whose ends are lost are
 * dropped; types this PC does not know become "unknown".
 */
export function remapGraph(
  backup: GraphBackup,
  campaignId: string,
  newId: () => string,
  portrait: (p: Portrait) => Portrait,
  knownTypeIds: ReadonlySet<string>,
): RemappedGraph {
  const characterIds = new Map(backup.characters.map((c) => [c.id, newId()]));
  const factionIds = new Map(backup.factions.map((f) => [f.id, newId()]));
  const endIds = new Map([...characterIds, ...factionIds]);

  const factions = backup.factions.map((f) => ({
    ...f,
    ...portrait(f),
    id: factionIds.get(f.id) ?? newId(),
    campaignId,
  }));
  const characters = backup.characters.map((c) => ({
    ...c,
    ...portrait(c),
    id: characterIds.get(c.id) ?? newId(),
    campaignId,
    factionIds: c.factionIds.flatMap((id) => factionIds.get(id) ?? []),
  }));
  const relations = backup.relations.flatMap((r) => {
    const fromId = endIds.get(r.fromId);
    const toId = endIds.get(r.toId);
    if (!fromId || !toId) return [];
    const typeId = knownTypeIds.has(r.typeId) ? r.typeId : UNKNOWN_TYPE;
    return [{ ...r, id: newId(), campaignId, fromId, toId, typeId }];
  });
  return { graph: { characters, factions, relations }, characterIds, factionIds };
}

/** Points the mentions in the descriptions to the new ids of a restored campaign. */
export function remapGraphMentions(
  graph: RelationGraph,
  ids: ReadonlyMap<string, string>,
): RelationGraph {
  return {
    ...graph,
    characters: graph.characters.map((c) => ({
      ...c,
      description: remapMentionText(c.description, ids),
    })),
    factions: graph.factions.map((f) => ({
      ...f,
      description: remapMentionText(f.description, ids),
    })),
  };
}
