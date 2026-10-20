import type { Db } from "../../shared/db/types";
import {
  BUILTIN_TYPES,
  decodeSymbol,
  encodeSymbol,
  isBuiltinTypeId,
  type CellType,
  type SightBlock,
} from "./domain/cellTypes";
import { fromJson, toJson } from "./domain/format";
import type { BattlemapModel } from "./domain/grid";

export interface RepoClock {
  now: () => Date;
  newId: () => string;
}

const defaultClock: RepoClock = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

// ---- Maps ----

export interface MapInfo {
  name: string;
  description: string;
}

export interface BattlemapSummary extends MapInfo {
  id: string;
  campaignId: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface Battlemap extends BattlemapSummary {
  model: BattlemapModel;
}

interface MapRow {
  id: string;
  campaign_id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

const SUMMARY_COLUMNS = "id, campaign_id, name, description, width, height, created_at, updated_at";

function summaryFromRow(row: MapRow): BattlemapSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInfo(info: MapInfo): MapInfo {
  const name = info.name.trim();
  if (name === "") throw new Error("Map name is required");
  return { name, description: info.description.trim() };
}

export async function listMaps(db: Db, campaignId: string): Promise<BattlemapSummary[]> {
  const rows = await db.select<MapRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM battlemaps WHERE campaign_id = ?`,
    [campaignId],
  );
  return rows
    .map(summaryFromRow)
    .sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base" }));
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
    `INSERT INTO battlemaps (id, campaign_id, name, description, width, height, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      campaignId,
      data.name,
      data.description,
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
    ...data,
    width: model.width,
    height: model.height,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateMapInfo(
  db: Db,
  id: string,
  info: MapInfo,
  clock: RepoClock = defaultClock,
): Promise<void> {
  const data = normalizeInfo(info);
  await db.execute("UPDATE battlemaps SET name = ?, description = ?, updated_at = ? WHERE id = ?", [
    data.name,
    data.description,
    clock.now().toISOString(),
    id,
  ]);
}

export async function saveMapModel(
  db: Db,
  id: string,
  model: BattlemapModel,
  clock: RepoClock = defaultClock,
): Promise<void> {
  await db.execute(
    "UPDATE battlemaps SET width = ?, height = ?, data = ?, updated_at = ? WHERE id = ?",
    [model.width, model.height, JSON.stringify(toJson(model)), clock.now().toISOString(), id],
  );
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
      symbol: decodeSymbol(r.symbol),
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
    `INSERT INTO cell_types (id, builtin, name, color, symbol, blocks_move, blocks_sight, comment, created_at, updated_at)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.color,
      encodeSymbol(data.symbol),
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
    `UPDATE cell_types SET name = ?, color = ?, symbol = ?, blocks_move = ?, blocks_sight = ?, comment = ?, updated_at = ?
     WHERE id = ? AND builtin = 0`,
    [
      data.name,
      data.color,
      encodeSymbol(data.symbol),
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
