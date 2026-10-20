import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import { runScript } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
import { addRegion, cellTypeAt, createModel, paintCells } from "./domain/grid";
import {
  copyMap,
  createCustomType,
  createMap,
  createObjectDef,
  deleteCustomType,
  deleteMap,
  deleteObjectDef,
  getMap,
  listCellTypes,
  listMaps,
  listObjectDefs,
  listTemplates,
  mapInsertStatement,
  saveMapModel,
  setBuiltinColor,
  updateCustomType,
  updateMapInfo,
  updateObjectDef,
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
      { name: " Склеп ", description: "", tags: [" склеп ", "Нежить", "нежить", ""] },
      createModel(30, 20),
      clock,
    );
    await createMap(
      db,
      "c1",
      { name: "Агора", description: "", tags: [] },
      createModel(10, 10),
      clock,
    );
    await createMap(
      db,
      "c2",
      { name: "Чужая", description: "", tags: [] },
      createModel(10, 10),
      clock,
    );

    expect((await listMaps(db, "c1")).map((m) => m.name)).toEqual(["Агора", "Склеп"]);

    let model = paintCells(createModel(30, 20, { perimeter: true }), [31], "water");
    model = addRegion(
      model,
      "r",
      { name: "Коридор", typeId: "floor", note: "", labelVisible: true },
      [32, 33, 34, 35, 36],
    );
    expect(a.tags).toEqual(["склеп", "Нежить"]);
    await saveMapModel(db, a.id, model, "data:image/webp;base64,AAAA", clock);
    await saveMapModel(db, a.id, model, null, clock);
    await updateMapInfo(
      db,
      a.id,
      { name: "Склеп 2", description: "сырость", tags: ["крипта"] },
      clock,
    );

    const loaded = await getMap(db, a.id);
    expect(loaded?.name).toBe("Склеп 2");
    expect(loaded?.description).toBe("сырость");
    expect(loaded?.tags).toEqual(["крипта"]);
    expect(loaded?.preview).toBe("data:image/webp;base64,AAAA");
    expect(loaded && cellTypeAt(loaded.model, 31)).toBe("water");
    expect(loaded && cellTypeAt(loaded.model, 0)).toBe("wall");
    expect(loaded?.model.regions[0]?.cells).toHaveLength(5);

    await deleteMap(db, a.id);
    expect(await getMap(db, a.id)).toBeNull();
  });

  it("saves maps as templates and creates maps from templates", async () => {
    const info = { name: "Таверна", description: "", tags: ["город"] };
    const map = await createMap(db, "c1", info, createModel(12, 10), clock);
    const model = {
      ...createModel(12, 10),
      objects: [{ id: "o", defId: "table", x: 2, y: 2, rotation: 0 as const }],
    };
    await saveMapModel(db, map.id, model, "data:image/webp;base64,AAAA", clock);

    const template = await copyMap(db, map.id, null, null, clock);
    expect(template).toMatchObject({ isTemplate: true, campaignId: "", name: "Таверна" });
    expect(template.tags).toEqual(["город"]);
    expect(template.preview).toBe("data:image/webp;base64,AAAA");
    expect((await listTemplates(db)).map((t) => t.id)).toEqual([template.id]);
    // Templates are not maps of any campaign.
    expect((await listMaps(db, "c1")).map((m) => m.id)).toEqual([map.id]);

    const copy = await copyMap(
      db,
      template.id,
      "c2",
      { name: "Таверна у реки", description: "", tags: [] },
      clock,
    );
    expect(copy).toMatchObject({ isTemplate: false, campaignId: "c2", name: "Таверна у реки" });
    expect((await getMap(db, copy.id))?.model.objects).toEqual(model.objects);
    expect((await listMaps(db, "c2")).map((m) => m.id)).toEqual([copy.id]);
  });

  it("manages the object catalog", async () => {
    const id = await createObjectDef(
      db,
      {
        name: " Стол ",
        width: 2,
        height: 1,
        color: "#8a5a2b",
        symbol: { kind: "image", value: "data:image/webp;base64,AAAA" },
        blocksMove: true,
        blocksSight: false,
      },
      clock,
    );
    await createObjectDef(
      db,
      {
        name: "Алтарь",
        width: 3,
        height: 3,
        color: "#999999",
        symbol: { kind: "letter", value: "А" },
        blocksMove: true,
        blocksSight: true,
      },
      clock,
    );
    let all = await listObjectDefs(db);
    expect(all.map((d) => d.name)).toEqual(["Алтарь", "Стол"]);
    expect(all[1]).toMatchObject({
      id,
      width: 2,
      height: 1,
      symbol: { kind: "image", value: "data:image/webp;base64,AAAA" },
      blocksMove: true,
      blocksSight: false,
    });

    const bad = { name: "Огромный", width: 11, height: 1, color: "#000000" };
    await expect(
      createObjectDef(db, { ...bad, symbol: null, blocksMove: false, blocksSight: false }),
    ).rejects.toThrow();

    await updateObjectDef(
      db,
      id,
      {
        name: "Стол",
        width: 3,
        height: 1,
        color: "#8a5a2b",
        symbol: null,
        blocksMove: false,
        blocksSight: false,
      },
      clock,
    );
    all = await listObjectDefs(db);
    expect(all.find((d) => d.id === id)).toMatchObject({ width: 3, symbol: null });

    await deleteObjectDef(db, id);
    expect((await listObjectDefs(db)).map((d) => d.name)).toEqual(["Алтарь"]);
  });

  it("stores the picture of a custom cell type", async () => {
    const image = "data:image/png;base64,iVBORw0KGgo=";
    const id = await createCustomType(
      db,
      {
        name: "Ковёр",
        color: "#aa3333",
        symbol: { kind: "image", value: image },
        blocksMove: false,
        blocksSight: false,
        comment: "",
      },
      clock,
    );
    expect((await listCellTypes(db)).find((t) => t.id === id)?.symbol).toEqual({
      kind: "image",
      value: image,
    });
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
        comment: "  2d6 огнём  ",
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
    expect(lava?.comment).toBe("2d6 огнём");
    expect(all.find((t) => t.id === "water")?.color).toBe("#0000ff");
    // Overrides do not show up as custom types.
    expect(all.filter((t) => !t.builtin)).toHaveLength(1);

    await updateCustomType(
      db,
      id,
      {
        name: "Лава",
        color: "#ff0000",
        symbol: null,
        blocksMove: true,
        blocksSight: true,
        comment: "",
      },
      clock,
    );
    await setBuiltinColor(db, "water", null, clock);
    all = await listCellTypes(db);
    expect(all.find((t) => t.id === id)).toMatchObject({
      color: "#ff0000",
      blocksSight: "yes",
      comment: "",
    });
    expect(all.find((t) => t.id === "water")?.color).not.toBe("#0000ff");

    await deleteCustomType(db, id);
    await deleteCustomType(db, "floor");
    all = await listCellTypes(db);
    expect(all.some((t) => t.id === id)).toBe(false);
    expect(all.some((t) => t.id === "floor")).toBe(true);
  });
});

describe("mapInsertStatement", () => {
  it("inserts a map restored from a backup with its preview and tags", async () => {
    const db = createMemoryDb();
    await migrate(db, migrations);
    const model = paintCells(createModel(8, 6, { perimeter: true }), [9, 10], "water");
    const entry = {
      name: " Склеп ",
      description: "Сырой",
      tags: ["нежить", "Нежить"],
      preview: "data:image/png;base64,AAAA",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      model,
    };
    await runScript(db, [mapInsertStatement("m1", "camp", entry)]);
    const [summary] = await listMaps(db, "camp");
    expect(summary).toMatchObject({
      id: "m1",
      name: "Склеп",
      tags: ["нежить"],
      preview: entry.preview,
      isTemplate: false,
      createdAt: entry.createdAt,
    });
    const stored = await getMap(db, "m1");
    expect(stored && cellTypeAt(stored.model, 9)).toBe("water");
  });
});
