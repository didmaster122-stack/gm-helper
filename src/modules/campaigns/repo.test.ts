import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import {
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
      { name: "  Проклятие Страда ", system: " D&D 5e ", description: "" },
      clock,
    );

    expect(c).toMatchObject({ name: "Проклятие Страда", system: "D&D 5e", archived: false });
    expect(await getCampaign(db, c.id)).toEqual(c);
  });

  it("lists active campaigns first, then by name ignoring case", async () => {
    const b = await createCampaign(db, { name: "бета", system: "PF2e", description: "" }, clock);
    await createCampaign(db, { name: "Альфа", system: "PF2e", description: "" }, clock);
    await createCampaign(db, { name: "Гамма", system: "PF2e", description: "" }, clock);
    await createCampaign(db, { name: "вега", system: "PF2e", description: "" }, clock);
    await setCampaignArchived(db, b.id, true, clock);

    const names = (await listCampaigns(db)).map((c) => c.name);

    expect(names).toEqual(["Альфа", "вега", "Гамма", "бета"]);
  });

  it("updates fields and bumps updatedAt", async () => {
    const c = await createCampaign(db, { name: "Старое", system: "PF2e", description: "" }, clock);

    await updateCampaign(
      db,
      c.id,
      { name: "Новое", system: "D&D 5e", description: "Описание" },
      clock,
    );

    const updated = await getCampaign(db, c.id);
    expect(updated).toMatchObject({ name: "Новое", system: "D&D 5e", description: "Описание" });
    expect(updated!.updatedAt > c.updatedAt).toBe(true);
    expect(updated!.createdAt).toBe(c.createdAt);
  });

  it("rejects invalid input", async () => {
    await expect(
      createCampaign(db, { name: " ", system: "PF2e", description: "" }),
    ).rejects.toThrow(/nameRequired/);
  });

  it("deletes a campaign", async () => {
    const c = await createCampaign(db, { name: "Удалить", system: "PF2e", description: "" }, clock);
    await deleteCampaign(db, c.id);
    expect(await getCampaign(db, c.id)).toBeNull();
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
    expect(validateCampaignInput({ description: "", ...input })).toEqual(expected);
  });
});
