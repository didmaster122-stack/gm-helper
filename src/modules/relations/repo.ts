import { runScript, sqlLiteral } from "../../shared/db/script";
import { placeholders } from "../../shared/db/placeholders";
import type { Db } from "../../shared/db/types";
import type { SearchRecord } from "../../shared/search/global";
import {
  CHARACTER_KINDS,
  CHARACTER_STATUSES,
  isBuiltinRelationType,
  LINE_STYLES,
  UNKNOWN_TYPE,
  type Character,
  type Faction,
  type LineStyle,
  type Relation,
  type RelationGraph,
  type RelationType,
} from "./domain/types";

export interface RepoClock {
  now: () => Date;
  newId: () => string;
}

const defaultClock: RepoClock = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

function parseStrings(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((v) => v === value) ?? fallback;
}

// ---- Graph ----

interface CharacterRow {
  id: string;
  campaign_id: string;
  name: string;
  kind: string;
  player: string;
  role: string;
  status: string;
  description: string;
  motivation: string;
  secrets: string;
  tags: string;
  factions: string;
  art_id: string | null;
  token_id: string | null;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
}

interface FactionRow {
  id: string;
  campaign_id: string;
  name: string;
  color: string;
  description: string;
  art_id: string | null;
  token_id: string | null;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
}

interface RelationRow {
  id: string;
  campaign_id: string;
  from_id: string;
  to_id: string;
  type_id: string;
  mutual: number;
  label: string;
  note: string;
  created_at: string;
  updated_at: string;
}

function characterFromRow(row: CharacterRow): Character {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    kind: oneOf(CHARACTER_KINDS, row.kind, "npc"),
    player: row.player,
    role: row.role,
    status: oneOf(CHARACTER_STATUSES, row.status, "unknown"),
    description: row.description,
    motivation: row.motivation,
    secrets: row.secrets,
    tags: parseStrings(row.tags),
    factionIds: parseStrings(row.factions),
    artId: row.art_id,
    tokenId: row.token_id,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function factionFromRow(row: FactionRow): Faction {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    color: row.color,
    description: row.description,
    artId: row.art_id,
    tokenId: row.token_id,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function relationFromRow(row: RelationRow): Relation {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    fromId: row.from_id,
    toId: row.to_id,
    typeId: row.type_id,
    mutual: row.mutual !== 0,
    label: row.label,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ru");

export async function loadGraph(db: Db, campaignId: string): Promise<RelationGraph> {
  const [characters, factions, relations] = await Promise.all([
    db.select<CharacterRow>("SELECT * FROM characters WHERE campaign_id = ?", [campaignId]),
    db.select<FactionRow>("SELECT * FROM factions WHERE campaign_id = ?", [campaignId]),
    db.select<RelationRow>(
      "SELECT * FROM relations WHERE campaign_id = ? ORDER BY created_at, id",
      [campaignId],
    ),
  ]);
  return {
    characters: characters.map(characterFromRow).sort(byName),
    factions: factions.map(factionFromRow).sort(byName),
    relations: relations.map(relationFromRow),
  };
}

const L = sqlLiteral;

function upsertCharacter(c: Character): string {
  return `INSERT OR REPLACE INTO characters (id, campaign_id, name, kind, player, role, status,
    description, motivation, secrets, tags, factions, art_id, token_id, x, y, created_at, updated_at)
    VALUES (${[
      L(c.id),
      L(c.campaignId),
      L(c.name),
      L(c.kind),
      L(c.player),
      L(c.role),
      L(c.status),
      L(c.description),
      L(c.motivation),
      L(c.secrets),
      L(JSON.stringify(c.tags)),
      L(JSON.stringify(c.factionIds)),
      L(c.artId),
      L(c.tokenId),
      L(c.x),
      L(c.y),
      L(c.createdAt),
      L(c.updatedAt),
    ].join(", ")})`;
}

function upsertFaction(f: Faction): string {
  return `INSERT OR REPLACE INTO factions (id, campaign_id, name, color, description, art_id,
    token_id, x, y, created_at, updated_at)
    VALUES (${[
      L(f.id),
      L(f.campaignId),
      L(f.name),
      L(f.color),
      L(f.description),
      L(f.artId),
      L(f.tokenId),
      L(f.x),
      L(f.y),
      L(f.createdAt),
      L(f.updatedAt),
    ].join(", ")})`;
}

function upsertRelation(r: Relation): string {
  return `INSERT OR REPLACE INTO relations (id, campaign_id, from_id, to_id, type_id, mutual,
    label, note, created_at, updated_at)
    VALUES (${[
      L(r.id),
      L(r.campaignId),
      L(r.fromId),
      L(r.toId),
      L(r.typeId),
      L(r.mutual),
      L(r.label),
      L(r.note),
      L(r.createdAt),
      L(r.updatedAt),
    ].join(", ")})`;
}

function diffList<T extends { id: string }>(
  table: string,
  prev: readonly T[],
  next: readonly T[],
  upsert: (item: T) => string,
): string[] {
  const before = new Map(prev.map((item) => [item.id, item]));
  const after = new Set(next.map((item) => item.id));
  const statements: string[] = [];
  for (const item of prev) {
    if (!after.has(item.id)) statements.push(`DELETE FROM ${table} WHERE id = ${L(item.id)}`);
  }
  // Graph edits keep unchanged entities by reference.
  for (const item of next) if (before.get(item.id) !== item) statements.push(upsert(item));
  return statements;
}

/** SQL that turns the stored graph `prev` into `next`. */
export function graphDiffStatements(prev: RelationGraph, next: RelationGraph): string[] {
  return [
    ...diffList("characters", prev.characters, next.characters, upsertCharacter),
    ...diffList("factions", prev.factions, next.factions, upsertFaction),
    ...diffList("relations", prev.relations, next.relations, upsertRelation),
  ];
}

/** Saves the change from `prev` to `next` atomically. */
export async function saveGraphChange(
  db: Db,
  prev: RelationGraph,
  next: RelationGraph,
): Promise<void> {
  const statements = graphDiffStatements(prev, next);
  if (statements.length > 0) await runScript(db, statements);
}

// ---- Relation types ----

interface RelationTypeRow {
  id: string;
  builtin: number;
  name: string;
  color: string;
  line_style: string;
  sort: number;
}

/** Types in their order; built-in types have name '' unless renamed. */
export async function listRelationTypes(db: Db): Promise<RelationType[]> {
  const rows = await db.select<RelationTypeRow>(
    "SELECT * FROM relation_types ORDER BY sort, created_at",
  );
  return rows.map((row) => ({
    id: row.id,
    builtin: row.builtin !== 0,
    name: row.name,
    color: row.color,
    lineStyle: oneOf<LineStyle>(LINE_STYLES, row.line_style, "solid"),
  }));
}

export interface RelationTypeInput {
  name: string;
  color: string;
  lineStyle: LineStyle;
}

/** Creates a custom type; `id` is given when restoring a campaign backup that uses it. */
export async function createRelationType(
  db: Db,
  input: RelationTypeInput,
  clock: RepoClock = defaultClock,
  id: string = clock.newId(),
): Promise<string> {
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO relation_types (id, builtin, name, color, line_style, sort, created_at, updated_at)
     VALUES (?, 0, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM relation_types), ?, ?)`,
    [id, input.name.trim(), input.color, input.lineStyle, now, now],
  );
  return id;
}

/** Built-in types can be renamed and recoloured too; an empty name restores the default one. */
export async function updateRelationType(
  db: Db,
  id: string,
  input: RelationTypeInput,
  clock: RepoClock = defaultClock,
): Promise<void> {
  await db.execute(
    "UPDATE relation_types SET name = ?, color = ?, line_style = ?, updated_at = ? WHERE id = ?",
    [input.name.trim(), input.color, input.lineStyle, clock.now().toISOString(), id],
  );
}

/** Deletes a custom type; its relations become "unknown". Built-in types cannot be deleted. */
export async function deleteRelationType(db: Db, id: string): Promise<void> {
  if (isBuiltinRelationType(id)) throw new Error(`Built-in relation type ${id} cannot be deleted`);
  await runScript(db, [
    `UPDATE relations SET type_id = ${L(UNKNOWN_TYPE)} WHERE type_id = ${L(id)}`,
    `DELETE FROM relation_types WHERE id = ${L(id)}`,
  ]);
}

export async function countRelationsOfType(db: Db, id: string): Promise<number> {
  const rows = await db.select<{ n: number }>(
    "SELECT COUNT(*) AS n FROM relations WHERE type_id = ?",
    [id],
  );
  return rows[0]?.n ?? 0;
}

/** Character names by id; ids that are not found are left out. */
export async function characterTitles(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select<{ id: string; title: string }>(
    `SELECT id, name AS title FROM characters WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Characters and factions of the campaigns for the app-wide search. */
export async function relationSearchRecords(
  db: Db,
  campaignIds: readonly string[],
): Promise<SearchRecord[]> {
  if (campaignIds.length === 0) return [];
  const where = `campaign_id IN (${placeholders(campaignIds)})`;
  const characters = await db.select<{
    id: string;
    campaign_id: string;
    name: string;
    player: string;
    role: string;
    description: string;
    motivation: string;
    secrets: string;
    tags: string;
  }>(
    `SELECT id, campaign_id, name, player, role, description, motivation, secrets, tags
     FROM characters WHERE ${where}`,
    campaignIds,
  );
  const factions = await db.select<{
    id: string;
    campaign_id: string;
    name: string;
    description: string;
  }>(`SELECT id, campaign_id, name, description FROM factions WHERE ${where}`, campaignIds);
  return [
    ...characters.map((r): SearchRecord => ({
      kind: "character",
      id: r.id,
      campaignId: r.campaign_id,
      title: r.name,
      detail: r.role,
      body: [r.player, r.role, r.description, r.motivation, r.secrets, ...parseStrings(r.tags)],
    })),
    ...factions.map((r): SearchRecord => ({
      kind: "faction",
      id: r.id,
      campaignId: r.campaign_id,
      title: r.name,
      body: [r.description],
    })),
  ];
}
