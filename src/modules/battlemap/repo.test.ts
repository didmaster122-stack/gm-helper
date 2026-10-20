import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { addRegion, cellTypeAt, createModel, paintCells } from "./domain/grid";
import {
  createCustomType,
  createMap,
  deleteCustomType,
  deleteMap,
  getMap,
  listCellTypes,
  listMaps,
  saveMapModel,
  setBuiltinColor,
  updateCustomType,
  updateMapInfo,
  type RepoClock,
} from "./repo";

function fakeClock(): RepoClock {
  let tick = 0;
  return {
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, tick++)),
    newId: () => `id-${tick}`,
  };
}

describe("battlemap repo", () => {
  let db: Db;
  let clock: RepoClock;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
    clock = fakeClock();
  });

  it("creates, lists, saves and reloads maps", async () => {
    const a = await createMap(
      db,
      "c1",
      { name: " Склеп ", description: "" },
      createModel(30, 20),
      clock,
    );
    await createMap(db, "c1", { name: "Агора", description: "" }, createModel(10, 10), clock);
    await createMap(db, "c2", { name: "Чужая", description: "" }, createModel(10, 10), clock);

    expect((await listMaps(db, "c1")).map((m) => m.name)).toEqual(["Агора", "Склеп"]);

    let model = paintCells(createModel(30, 20, { perimeter: true }), [31], "water");
    model = addRegion(
      model,
      "r",
      { name: "Коридор", typeId: "floor", note: "", labelVisible: true },
      [32, 33, 34, 35, 36],
    );
    await saveMapModel(db, a.id, model, clock);
    await updateMapInfo(db, a.id, { name: "Склеп 2", description: "сырость" }, clock);

    const loaded = await getMap(db, a.id);
    expect(loaded?.name).toBe("Склеп 2");
    expect(loaded?.description).toBe("сырость");
    expect(loaded && cellTypeAt(loaded.model, 31)).toBe("water");
    expect(loaded && cellTypeAt(loaded.model, 0)).toBe("wall");
    expect(loaded?.model.regions[0]?.cells).toHaveLength(5);

    await deleteMap(db, a.id);
    expect(await getMap(db, a.id)).toBeNull();
  });

  it("manages custom cell types and built-in colours", async () => {
    const types = await listCellTypes(db);
    expect(types.map((t) => t.id).slice(0, 2)).toEqual(["floor", "wall"]);

    const id = await createCustomType(
      db,
      {
        name: " Лава ",
        color: "#ff4400",
        symbol: { kind: "letter", value: "Л" },
        blocksMove: true,
        blocksSight: false,
      },
      clock,
    );
    await setBuiltinColor(db, "water", "#0000ff", clock);

    let all = await listCellTypes(db);
    const lava = all.find((t) => t.id === id);
    expect(lava).toMatchObject({
      name: "Лава",
      builtin: false,
      blocksMove: true,
      blocksSight: "no",
    });
    expect(lava?.symbol).toEqual({ kind: "letter", value: "Л" });
    expect(all.find((t) => t.id === "water")?.color).toBe("#0000ff");
    // Overrides do not show up as custom types.
    expect(all.filter((t) => !t.builtin)).toHaveLength(1);

    await updateCustomType(
      db,
      id,
      { name: "Лава", color: "#ff0000", symbol: null, blocksMove: true, blocksSight: true },
      clock,
    );
    await setBuiltinColor(db, "water", null, clock);
    all = await listCellTypes(db);
    expect(all.find((t) => t.id === id)).toMatchObject({ color: "#ff0000", blocksSight: "yes" });
    expect(all.find((t) => t.id === "water")?.color).not.toBe("#0000ff");

    await deleteCustomType(db, id);
    await deleteCustomType(db, "floor");
    all = await listCellTypes(db);
    expect(all.some((t) => t.id === id)).toBe(false);
    expect(all.some((t) => t.id === "floor")).toBe(true);
  });
});
