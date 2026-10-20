import { describe, expect, it } from "vitest";
import { parseMapsBackup, toMapsBackup, type MapEntry } from "./backup";
import { BUILTIN_TYPES, type CellType } from "./cellTypes";
import { cellTypeAt, createModel, paintCells, type BattlemapModel } from "./grid";
import { addObject, type ObjectDef } from "./objects";

const T = "2026-10-20T12:00:00.000Z";
const NOW = "2026-10-21T00:00:00.000Z";

const custom = (id: string, name: string): CellType => ({
  id,
  builtin: false,
  name,
  color: "#336699",
  pattern: "none",
  symbol: null,
  blocksMove: false,
  blocksSight: "no",
  comment: "",
});

const types: CellType[] = [
  ...BUILTIN_TYPES.map((t) => ({ ...t, name: "" })),
  custom("lava", "Лава"),
  custom("moss", "Мох"),
  custom("unused", "Лишний"),
];

const table: ObjectDef = {
  id: "table",
  name: "Стол",
  width: 2,
  height: 1,
  color: "#8b5a2b",
  symbol: null,
  blocksMove: true,
  blocksSight: false,
};

function entry(name: string, typeIds: string[], withTable: boolean): MapEntry {
  let model = createModel(6, 5, { perimeter: true });
  typeIds.forEach((id, i) => {
    model = paintCells(model, [7 + i], id);
  });
  if (withTable) {
    const sizeOf = () => ({ width: 2, height: 1 });
    model = addObject(model, sizeOf, { id: "t1", defId: "table", x: 1, y: 1, rotation: 0 });
  }
  return {
    name,
    description: "",
    tags: ["таверна"],
    preview: "",
    createdAt: T,
    updatedAt: T,
    model,
  };
}

describe("maps backup", () => {
  const maps = [entry("Таверна", ["lava", "moss"], true), entry("Склеп", ["lava"], false)];
  const backup = toMapsBackup(maps, types, [table]);

  it("includes each used custom type and object once", () => {
    expect(backup.customTypes.map((t) => t.id)).toEqual(["lava", "moss"]);
    expect(backup.objects.map((o) => o.id)).toEqual(["table"]);
  });

  it("survives a JSON round trip", () => {
    const parsed = parseMapsBackup(JSON.parse(JSON.stringify(backup)), NOW);
    expect(parsed.skipped).toBe(0);
    expect(parsed.maps.map((m) => m.name)).toEqual(["Таверна", "Склеп"]);
    expect(parsed.maps[0]?.tags).toEqual(["таверна"]);
    expect(parsed.maps[0]?.model.objects).toHaveLength(1);
    // Palette codes may be renumbered; the type of every cell must stay.
    const typesOf = (m: BattlemapModel | undefined) =>
      m ? Array.from(m.cells, (_, i) => cellTypeAt(m, i)) : [];
    expect(typesOf(parsed.maps[1]?.model)).toEqual(typesOf(maps[1]?.model));
    expect(parsed.customTypes).toEqual(backup.customTypes);
    expect(parsed.objects).toEqual(backup.objects);
  });

  it("skips maps with broken data", () => {
    const raw = JSON.parse(JSON.stringify(backup)) as { maps: { map: unknown }[] };
    if (raw.maps[1]) raw.maps[1].map = { version: 2, width: 3 };
    const parsed = parseMapsBackup(raw, NOW);
    expect(parsed.maps).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
    expect(parseMapsBackup(undefined, NOW)).toEqual({
      maps: [],
      customTypes: [],
      objects: [],
      skipped: 0,
    });
  });
});
