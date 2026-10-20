import { runScript, sqlLiteral } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
import type { Campaign, CampaignInput } from "./types";
import { normalizeCampaignInput, validateCampaignInput } from "./validation";

interface CampaignRow {
  id: string;
  name: string;
  system: string;
  description: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

function fromRow(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    system: row.system,
    description: row.description,
    archived: row.archived !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertValid(input: CampaignInput): CampaignInput {
  const errors = validateCampaignInput(input);
  if (errors.length > 0) throw new Error(`Invalid campaign: ${errors.join(", ")}`);
  return normalizeCampaignInput(input);
}

export interface RepoClock {
  now: () => Date;
  newId: () => string;
}

const defaultClock: RepoClock = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

export async function listCampaigns(db: Db): Promise<Campaign[]> {
  const rows = await db.select<CampaignRow>("SELECT * FROM campaigns");
  // SQLite NOCASE only folds ASCII, so names are sorted here.
  return rows
    .map(fromRow)
    .sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
    );
}

export async function getCampaign(db: Db, id: string): Promise<Campaign | null> {
  const rows = await db.select<CampaignRow>("SELECT * FROM campaigns WHERE id = ?", [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function createCampaign(
  db: Db,
  input: CampaignInput,
  clock: RepoClock = defaultClock,
): Promise<Campaign> {
  const data = assertValid(input);
  const id = clock.newId();
  const now = clock.now().toISOString();
  await db.execute(
    `INSERT INTO campaigns (id, name, system, description, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [id, data.name, data.system, data.description, now, now],
  );
  return { id, ...data, archived: false, createdAt: now, updatedAt: now };
}

export async function updateCampaign(
  db: Db,
  id: string,
  input: CampaignInput,
  clock: RepoClock = defaultClock,
): Promise<void> {
  const data = assertValid(input);
  await db.execute(
    "UPDATE campaigns SET name = ?, system = ?, description = ?, updated_at = ? WHERE id = ?",
    [data.name, data.system, data.description, clock.now().toISOString(), id],
  );
}

export async function setCampaignArchived(
  db: Db,
  id: string,
  archived: boolean,
  clock: RepoClock = defaultClock,
): Promise<void> {
  await db.execute("UPDATE campaigns SET archived = ?, updated_at = ? WHERE id = ?", [
    archived ? 1 : 0,
    clock.now().toISOString(),
    id,
  ]);
}

/** Deletes the campaign with its maps, relation graph and timeline. */
export async function deleteCampaign(db: Db, id: string): Promise<void> {
  const key = sqlLiteral(id);
  await runScript(db, [
    `DELETE FROM battlemaps WHERE campaign_id = ${key}`,
    `DELETE FROM relations WHERE campaign_id = ${key}`,
    `DELETE FROM characters WHERE campaign_id = ${key}`,
    `DELETE FROM factions WHERE campaign_id = ${key}`,
    `DELETE FROM timeline_links WHERE campaign_id = ${key}`,
    `DELETE FROM timeline_markers WHERE campaign_id = ${key}`,
    `DELETE FROM timeline_events WHERE campaign_id = ${key}`,
    `DELETE FROM timeline_lanes WHERE campaign_id = ${key}`,
    `DELETE FROM timelines WHERE campaign_id = ${key}`,
    `DELETE FROM campaigns WHERE id = ${key}`,
  ]);
}
