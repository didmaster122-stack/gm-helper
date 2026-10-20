import { sqlLiteral as L } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
import type { MapEntry } from "./domain/backup";
import {
  BUILTIN_TYPES,
  decodeSymbol,
  encodeSymbol,
  isBuiltinTypeId,
  symbolImage,
  type CellType,
  type SightBlock,
} from "./domain/cellTypes";
import { fromJson, toJson } from "./domain/format";
import type { BattlemapModel } from "./domain/grid";
import { isValidObjectSize, type ObjectDef } from "./domain/objects";

export interface RepoClock {
  now: () => Date;
  newId: () => string;
}

const defaultClock: RepoClock = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

// ---- Maps and templates ----

export interface MapInfo {
  name: string;
  description: string;
  tags: string[];
}

export interface BattlemapSummary extends MapInfo {
  id: string;
  /** Empty for templates. */
  campaignId: string;
  isTemplate: boolean;
  width: number;
  height: number;
  /** Data URL of the gallery picture; empty until the map is first saved from the editor. */
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface Battlemap extends BattlemapSummary {
  model: BattlemapModel;
}

interface MapRow {
  id: string;
  campaign_id: string;
  is_template: number;
  name: string;
  description: string;
  tags: string;
  width: number;
  height: number;
  preview: string;
  created_at: string;
  updated_at: string;
}

const SUMMARY_COLUMNS =
  "id, campaign_id, is_template, name, description, tags, width, height, preview, created_at, updated_at";

function parseTags(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function summaryFromRow(row: MapRow): BattlemapSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    isTemplate: row.is_template !== 0,
    name: row.name,
    description: row.description,
    tags: parseTags(row.tags),
    width: row.width,
    height: row.height,
    preview: row.preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Trimmed, without empty ones and case-insensitive duplicates. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase("ru");
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function normalizeInfo(info: MapInfo): MapInfo {
  const name = info.name.trim();
  if (name === "") throw new Error("Map name is required");
  return { name, description: info.description.trim(), tags: normalizeTags(info.tags) };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "ru", { sensitivity: "base", numeric: true });

/** Maps of a campaign (templates excluded), by name. */
export async function listMaps(db: Db, campaignId: string): Promise<BattlemapSummary[]> {
  const rows = await db.select<MapRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM battlemaps WHERE campaign_id = ? AND is_template = 0`,
    [campaignId],
  );
  return rows.map(summaryFromRow).sort(byName);
}

/** Templates: the map library shared by all campaigns, by name. */
export async function listTemplates(db: Db): Promise<BattlemapSummary[]> {
  const rows = await db.select<MapRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM battlemaps WHERE is_template = 1`,
  );
  return rows.map(summaryFromRow).sort(byName);
}

async function getSummary(db: Db, id: string): Promise<BattlemapSummary | null> {
  const rows = await db.select<MapRow>(`SELECT ${SUMMARY_COLUMNS} FROM battlemaps WHERE id = ?`, [
    id,
  ]);
  const row = rows[0];
  return row ? summaryFromRow(row) : null;
}

export async function getMap(db: Db, id: string): Promise<Battlemap | null> {
  const rows = await db.select<MapRow & { data: string }>(
    `SELECT ${SUMMARY_COLUMNS}, data FROM battlemaps WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...summaryFromRow(row), model: fromJson(JSON.parse(row.data)) };
}

export async function createMap(
  db: Db,
  campaignId: string,
  info: MapInfo,
  model: BattlemapModel,
  clock: RepoClock = defaultClock,
): Promise<BattlemapSummary> {
  const data = normalizeInfo(info);
  const id = clock.newId();
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO battlemaps (id, campaign_id, is_template, name, description, tags, width, height, data, preview, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
    [
      id,
      campaignId,
      data.name,
      data.description,
      JSON.stringify(data.tags),
      model.width,
      model.height,
      JSON.stringify(toJson(model)),
      now,
      now,
    ],
  );
  return {
    id,
    campaignId,
    isTemplate: false,
    ...data,
    width: model.width,
    height: model.height,
    preview: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Copies a map or a template with everything in it: "save as template"
 * (`campaignId` null) and "new map from template" (the target campaign).
 * `info` replaces the copied name, description and tags.
 */
export async function copyMap(
  db: Db,
  sourceId: string,
  campaignId: string | null,
  info: MapInfo | null = null,
  clock: RepoClock = defaultClock,
): Promise<BattlemapSummary> {
  const id = clock.newId();
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO battlemaps (id, campaign_id, is_template, name, description, tags, width, height, data, preview, created_at, updated_at)
     SELECT ?, ?, ?, name, description, tags, width, height, data, preview, ?, ? FROM battlemaps WHERE id = ?`,
    [id, campaignId ?? "", campaignId === null ? 1 : 0, now, now, sourceId],
  );
  if (info) await updateMapInfo(db, id, info, clock);
  const created = await getSummary(db, id);
  if (!created) throw new Error(`Battlemap ${sourceId} not found`);
  return created;
}

export async function updateMapInfo(
  db: Db,
  id: string,
  info: MapInfo,
  clock: RepoClock = defaultClock,
): Promise<void> {
  const data = normalizeInfo(info);
  await db.execute(
    "UPDATE battlemaps SET name = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?",
    [data.name, data.description, JSON.stringify(data.tags), clock.now().toISOString(), id],
  );
}

/** Saves the map; `preview` (a data URL) is kept unchanged when null. */
export async function saveMapModel(
  db: Db,
  id: string,
  model: BattlemapModel,
  preview: string | null,
  clock: RepoClock = defaultClock,
): Promise<void> {
  await db.execute(
    `UPDATE battlemaps SET width = ?, height = ?, data = ?, preview = COALESCE(?, preview), updated_at = ?
     WHERE id = ?`,
    [
      model.width,
      model.height,
      JSON.stringify(toJson(model)),
      preview,
      clock.now().toISOString(),
      id,
    ],
  );
}

/** Insert of a map restored from a campaign backup, for a batch script. */
export function mapInsertStatement(id: string, campaignId: string, entry: MapEntry): string {
  const info = normalizeInfo(entry);
  const { model } = entry;
  return `INSERT INTO battlemaps (id, campaign_id, is_template, name, description, tags, width, height,
    data, preview, created_at, updated_at)
    VALUES (${[
      L(id),
      L(campaignId),
      L(0),
      L(info.name),
      L(info.description),
      L(JSON.stringify(info.tags)),
      L(model.width),
      L(model.height),
      L(JSON.stringify(toJson(model))),
      L(entry.preview),
      L(entry.createdAt),
      L(entry.updatedAt),
    ].join(", ")})`;
}

export async function deleteMap(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM battlemaps WHERE id = ?", [id]);
}

// ---- Cell types ----

/** Editable fields of a custom cell type. */
export interface CustomTypeInput {
  name: string;
  color: string;
  symbol: CellType["symbol"];
  blocksMove: boolean;
  blocksSight: boolean;
  comment: string;
}

interface TypeRow {
  id: string;
  builtin: number;
  name: string;
  color: string;
  symbol: string;
  image: string;
  blocks_move: number;
  blocks_sight: string;
  comment: string;
  created_at: string;
}

/**
 * All cell types: built-ins first (with saved colour overrides, names left empty for
 * the caller to fill from i18n), then custom ones by creation time.
 */
export async function listCellTypes(db: Db): Promise<CellType[]> {
  const rows = await db.select<TypeRow>("SELECT * FROM cell_types ORDER BY created_at, id");
  const overrides = new Map(rows.filter((r) => r.builtin !== 0).map((r) => [r.id, r.color]));
  const builtins: CellType[] = BUILTIN_TYPES.map((t) => ({
    ...t,
    name: "",
    color: overrides.get(t.id) ?? t.color,
  }));
  const custom: CellType[] = rows
    .filter((r) => r.builtin === 0)
    .map((r) => ({
      id: r.id,
      builtin: false,
      name: r.name,
      color: r.color,
      pattern: "none",
      symbol: decodeSymbol(r.symbol, r.image),
      blocksMove: r.blocks_move !== 0,
      blocksSight: (r.blocks_sight === "yes" ? "yes" : "no") satisfies SightBlock,
      comment: r.comment,
    }));
  return [...builtins, ...custom];
}

function normalizeType(input: CustomTypeInput): CustomTypeInput {
  const name = input.name.trim();
  if (name === "") throw new Error("Cell type name is required");
  return { ...input, name, comment: input.comment.trim() };
}

/** Creates a custom type; `id` is given when importing a map that uses it. */
export async function createCustomType(
  db: Db,
  input: CustomTypeInput,
  clock: RepoClock = defaultClock,
  id: string = clock.newId(),
): Promise<string> {
  const data = normalizeType(input);
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO cell_types (id, builtin, name, color, symbol, image, blocks_move, blocks_sight, comment, created_at, updated_at)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.color,
      encodeSymbol(data.symbol),
      symbolImage(data.symbol),
      data.blocksMove ? 1 : 0,
      data.blocksSight ? "yes" : "no",
      data.comment,
      now,
      now,
    ],
  );
  return id;
}

export async function updateCustomType(
  db: Db,
  id: string,
  input: CustomTypeInput,
  clock: RepoClock = defaultClock,
): Promise<void> {
  const data = normalizeType(input);
  await db.execute(
    `UPDATE cell_types SET name = ?, color = ?, symbol = ?, image = ?, blocks_move = ?, blocks_sight = ?,
       comment = ?, updated_at = ?
     WHERE id = ? AND builtin = 0`,
    [
      data.name,
      data.color,
      encodeSymbol(data.symbol),
      symbolImage(data.symbol),
      data.blocksMove ? 1 : 0,
      data.blocksSight ? "yes" : "no",
      data.comment,
      clock.now().toISOString(),
      id,
    ],
  );
}

/** Deletes a custom type. Maps keep its id and show those cells as floor. */
export async function deleteCustomType(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM cell_types WHERE id = ? AND builtin = 0", [id]);
}

/** Sets or (with null) resets the colour of a built-in type. */
export async function setBuiltinColor(
  db: Db,
  id: string,
  color: string | null,
  clock: RepoClock = defaultClock,
): Promise<void> {
  if (!isBuiltinTypeId(id)) throw new Error(`Not a built-in cell type: ${id}`);
  if (color === null) {
    await db.execute("DELETE FROM cell_types WHERE id = ? AND builtin = 1", [id]);
    return;
  }
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO cell_types (id, builtin, color, created_at, updated_at) VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at`,
    [id, color, now, now],
  );
}

// ---- Object catalog ----

/** Editable fields of a catalog object. */
export type ObjectDefInput = Omit<ObjectDef, "id">;

interface ObjectRow {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string;
  symbol: string;
  image: string;
  blocks_move: number;
  blocks_sight: number;
}

function normalizeObject(input: ObjectDefInput): ObjectDefInput {
  const name = input.name.trim();
  if (name === "") throw new Error("Object name is required");
  if (!isValidObjectSize(input.width) || !isValidObjectSize(input.height)) {
    throw new Error(`Invalid object size ${input.width}×${input.height}`);
  }
  return { ...input, name };
}

/** All catalog objects by name. */
export async function listObjectDefs(db: Db): Promise<ObjectDef[]> {
  const rows = await db.select<ObjectRow>("SELECT * FROM map_objects");
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      color: r.color,
      symbol: decodeSymbol(r.symbol, r.image),
      blocksMove: r.blocks_move !== 0,
      blocksSight: r.blocks_sight !== 0,
    }))
    .sort(byName);
}

/** Creates a catalog object; `id` is given when importing a map that uses it. */
export async function createObjectDef(
  db: Db,
  input: ObjectDefInput,
  clock: RepoClock = defaultClock,
  id: string = clock.newId(),
): Promise<string> {
  const d = normalizeObject(input);
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO map_objects (id, name, width, height, color, symbol, image, blocks_move, blocks_sight, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      d.name,
      d.width,
      d.height,
      d.color,
      encodeSymbol(d.symbol),
      symbolImage(d.symbol),
      d.blocksMove ? 1 : 0,
      d.blocksSight ? 1 : 0,
      now,
      now,
    ],
  );
  return id;
}

export async function updateObjectDef(
  db: Db,
  id: string,
  input: ObjectDefInput,
  clock: RepoClock = defaultClock,
): Promise<void> {
  const d = normalizeObject(input);
  await db.execute(
    `UPDATE map_objects SET name = ?, width = ?, height = ?, color = ?, symbol = ?, image = ?,
       blocks_move = ?, blocks_sight = ?, updated_at = ?
     WHERE id = ?`,
    [
      d.name,
      d.width,
      d.height,
      d.color,
      encodeSymbol(d.symbol),
      symbolImage(d.symbol),
      d.blocksMove ? 1 : 0,
      d.blocksSight ? 1 : 0,
      clock.now().toISOString(),
      id,
    ],
  );
}

/** Deletes a catalog object. Maps keep their instances and show them as "?". */
export async function deleteObjectDef(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM map_objects WHERE id = ?", [id]);
}
