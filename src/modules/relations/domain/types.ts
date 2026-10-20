export type CharacterKind = "npc" | "pc";
export type CharacterStatus = "alive" | "dead" | "missing" | "unknown";

export const CHARACTER_KINDS: readonly CharacterKind[] = ["npc", "pc"];
export const CHARACTER_STATUSES: readonly CharacterStatus[] = [
  "alive",
  "dead",
  "missing",
  "unknown",
];

/** Picture of a character or faction: an art of the library, optionally one of its tokens. */
export interface Portrait {
  artId: string | null;
  tokenId: string | null;
}

export interface Character extends Portrait {
  id: string;
  campaignId: string;
  name: string;
  kind: CharacterKind;
  /** Player name, for player characters. */
  player: string;
  /** Role or short description shown under the name. */
  role: string;
  status: CharacterStatus;
  description: string;
  motivation: string;
  /** GM-only notes. */
  secrets: string;
  tags: string[];
  /** Faction ids; the first one is the main faction (the frame the node is drawn in). */
  factionIds: string[];
  /** Top-left corner of the node on the graph. */
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export interface Faction extends Portrait {
  id: string;
  campaignId: string;
  name: string;
  color: string;
  description: string;
  /** Top-left corner of the frame while the faction has no members on the graph. */
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

/** Directed link from one character or faction to another (spec §4.3). */
export interface Relation {
  id: string;
  campaignId: string;
  fromId: string;
  toId: string;
  typeId: string;
  /** Drawn as one line with arrows at both ends. */
  mutual: boolean;
  /** Short text shown on the graph. */
  label: string;
  /** Long text shown in the side panel. */
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** Everything the relation graph of one campaign stores. Immutable: edits make new objects. */
export interface RelationGraph {
  characters: readonly Character[];
  factions: readonly Faction[];
  relations: readonly Relation[];
}

export type LineStyle = "solid" | "dashed" | "dotted";
export const LINE_STYLES: readonly LineStyle[] = ["solid", "dashed", "dotted"];

export const BUILTIN_RELATION_TYPES = [
  "alliance",
  "friendship",
  "enmity",
  "rivalry",
  "love",
  "kinship",
  "service",
  "debt",
  "fear",
  "unknown",
] as const;
export type BuiltinRelationTypeId = (typeof BUILTIN_RELATION_TYPES)[number];

/** Type used for relations whose type was deleted. */
export const UNKNOWN_TYPE: BuiltinRelationTypeId = "unknown";

export interface RelationType {
  id: string;
  builtin: boolean;
  /** Display name (for built-in types: the custom name or the default from i18n). */
  name: string;
  color: string;
  lineStyle: LineStyle;
}

export function isBuiltinRelationType(id: string): id is BuiltinRelationTypeId {
  return (BUILTIN_RELATION_TYPES as readonly string[]).includes(id);
}

export const emptyGraph: RelationGraph = { characters: [], factions: [], relations: [] };
