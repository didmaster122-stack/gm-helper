import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { runScript } from "../../shared/db/script";
import {
  campaignInsertStatement,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  setCampaignArchived,
  updateCampaign,
  type RepoClock,
} from "./repo";
import { validateCampaignInput } from "./validation";

function fakeClock(): RepoClock {
  let tick = 0;
  return {
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, tick++)),
    newId: () => `id-${tick}`,
  };
}

describe("campaign repo", () => {
  let db: Db;
  let clock: RepoClock;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
    clock = fakeClock();
  });

  it("creates a campaign with trimmed fields", async () => {
    const c = await createCampaign(
      db,
      { name: "  Проклятие Страда ", system: " D&D 5e ", description: "", coverArtId: null },
      clock,
    );

    expect(c).toMatchObject({ name: "Проклятие Страда", system: "D&D 5e", archived: false });
    expect(await getCampaign(db, c.id)).toEqual(c);
  });

  it("lists active campaigns first, then by name ignoring case", async () => {
    const b = await createCampaign(
      db,
      { name: "бета", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    await createCampaign(
      db,
      { name: "Альфа", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    await createCampaign(
      db,
      { name: "Гамма", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    await createCampaign(
      db,
      { name: "вега", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    await setCampaignArchived(db, b.id, true, clock);

    const names = (await listCampaigns(db)).map((c) => c.name);

    expect(names).toEqual(["Альфа", "вега", "Гамма", "бета"]);
  });

  it("updates fields and bumps updatedAt", async () => {
    const c = await createCampaign(
      db,
      { name: "Старое", system: "PF2e", description: "", coverArtId: null },
      clock,
    );

    await updateCampaign(
      db,
      c.id,
      { name: "Новое", system: "D&D 5e", description: "Описание", coverArtId: null },
      clock,
    );

    const updated = await getCampaign(db, c.id);
    expect(updated).toMatchObject({
      name: "Новое",
      system: "D&D 5e",
      description: "Описание",
      coverArtId: null,
    });
    expect(updated!.updatedAt > c.updatedAt).toBe(true);
    expect(updated!.createdAt).toBe(c.createdAt);
  });

  it("rejects invalid input", async () => {
    await expect(
      createCampaign(db, { name: " ", system: "PF2e", description: "", coverArtId: null }),
    ).rejects.toThrow(/nameRequired/);
  });

  it("deletes a campaign", async () => {
    const c = await createCampaign(
      db,
      { name: "Удалить", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    await deleteCampaign(db, c.id);
    expect(await getCampaign(db, c.id)).toBeNull();
  });

  it("keeps the cover art", async () => {
    const c = await createCampaign(
      db,
      { name: "К", system: "PF2e", description: "", coverArtId: "art-1" },
      clock,
    );
    expect((await getCampaign(db, c.id))?.coverArtId).toBe("art-1");
    await updateCampaign(db, c.id, { ...c, coverArtId: null }, clock);
    expect((await getCampaign(db, c.id))?.coverArtId).toBeNull();
  });

  it("deletes the campaign's sessions with it", async () => {
    const c = await createCampaign(
      db,
      { name: "К", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    const session = `INSERT INTO sessions (id, campaign_id, number, created_at, updated_at)
      VALUES (?, ?, 1, '', '')`;
    await db.execute(session, ["s1", c.id]);
    await db.execute(session, ["s2", "other"]);
    const item = `INSERT INTO session_prep_items (id, session_id, text, position) VALUES (?, ?, 'П', 0)`;
    await db.execute(item, ["i1", "s1"]);
    await db.execute(item, ["i2", "s2"]);
    await deleteCampaign(db, c.id);
    const sessions = await db.select<{ id: string }>("SELECT id FROM sessions");
    const items = await db.select<{ id: string }>("SELECT id FROM session_prep_items");
    expect(sessions.map((r) => r.id)).toEqual(["s2"]);
    expect(items.map((r) => r.id)).toEqual(["i2"]);
  });

  it("deletes the campaign's maps with it", async () => {
    const c = await createCampaign(
      db,
      { name: "К", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    const insert = `INSERT INTO battlemaps (id, campaign_id, name, width, height, data, created_at, updated_at)
      VALUES (?, ?, 'Карта', 5, 5, '{}', '', '')`;
    await db.execute(insert, ["m1", c.id]);
    await db.execute(insert, ["m2", "other"]);
    await deleteCampaign(db, c.id);
    const left = await db.select<{ id: string }>("SELECT id FROM battlemaps");
    expect(left.map((r) => r.id)).toEqual(["m2"]);
  });

  it("deletes the campaign's relation graph with it", async () => {
    const c = await createCampaign(
      db,
      { name: "К", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    const character = `INSERT INTO characters (id, campaign_id, name, kind, status, created_at, updated_at)
      VALUES (?, ?, 'Имя', 'npc', 'alive', '', '')`;
    await db.execute(character, ["c1", c.id]);
    await db.execute(character, ["c2", "other"]);
    await db.execute(
      `INSERT INTO factions (id, campaign_id, name, color, created_at, updated_at)
      VALUES ('f', ?, 'Ф', '#fff', '', '')`,
      [c.id],
    );
    await db.execute(
      `INSERT INTO relations (id, campaign_id, from_id, to_id, type_id, created_at, updated_at)
      VALUES ('r', ?, 'a', 'b', 'love', '', '')`,
      [c.id],
    );
    await deleteCampaign(db, c.id);
    const count = async (table: string) =>
      (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n;
    const left = await db.select<{ id: string }>("SELECT id FROM characters");
    expect(left.map((r) => r.id)).toEqual(["c2"]);
    expect(await count("factions")).toBe(0);
    expect(await count("relations")).toBe(0);
  });

  it("deletes the campaign's timeline with it", async () => {
    const c = await createCampaign(
      db,
      { name: "К", system: "PF2e", description: "", coverArtId: null },
      clock,
    );
    await db.execute("INSERT INTO timelines (campaign_id, session_count) VALUES (?, 3)", [c.id]);
    await db.execute(
      `INSERT INTO timeline_lanes (id, campaign_id, kind, sort, created_at, updated_at)
      VALUES ('l', ?, 'main', 0, '', '')`,
      [c.id],
    );
    await db.execute(
      `INSERT INTO timeline_events (id, campaign_id, lane_id, sort, title, importance, status,
      created_at, updated_at) VALUES ('e', ?, 'l', 0, 'С', 'major', 'planned', '', '')`,
      [c.id],
    );
    await db.execute(
      `INSERT INTO timeline_links (id, campaign_id, from_id, to_id, created_at, updated_at)
      VALUES ('k', ?, 'e', 'e', '', '')`,
      [c.id],
    );
    await db.execute(
      `INSERT INTO timeline_markers (id, campaign_id, label, level, sort, created_at, updated_at)
      VALUES ('m', ?, 'Зима', 1, 0, '', '')`,
      [c.id],
    );
    await deleteCampaign(db, c.id);
    const count = async (table: string) =>
      (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n;
    const tables = ["timelines", "timeline_lanes", "timeline_events", "timeline_links"];
    for (const table of [...tables, "timeline_markers"]) {
      expect(await count(table)).toBe(0);
    }
  });
});

describe("validateCampaignInput", () => {
  it.each([
    [{ name: "", system: "PF2e" }, ["nameRequired"]],
    [{ name: "x".repeat(101), system: "PF2e" }, ["nameTooLong"]],
    [{ name: "Ок", system: "" }, ["systemRequired"]],
    [{ name: "Ок", system: "D&D: 5e" }, ["systemInvalid"]],
    [{ name: "Ок", system: "_tokens" }, ["systemInvalid"]],
    [{ name: "Ок", system: "D&D 5e" }, []],
  ])("%o → %o", (input, expected) => {
    expect(validateCampaignInput({ description: "", coverArtId: null, ...input })).toEqual(
      expected,
    );
  });
});

describe("campaignInsertStatement", () => {
  it("inserts a campaign restored from a backup, and validates it", async () => {
    const db = createMemoryDb();
    await migrate(db, migrations);
    const campaign = {
      id: "c1",
      name: " Тьма O'Hara ",
      system: "D&D 5e",
      description: "",
      coverArtId: "art-1",
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    };
    await runScript(db, [campaignInsertStatement(campaign)]);
    expect(await getCampaign(db, "c1")).toEqual({ ...campaign, name: "Тьма O'Hara" });
    expect(() => campaignInsertStatement({ ...campaign, system: "" })).toThrow();
  });
});
