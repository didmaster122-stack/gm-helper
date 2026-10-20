import { describe, expect, it } from "vitest";
import { BUILTIN_TYPES, makeTypeLookup, type CellType } from "./cellTypes";
import {
  fitsCanvas,
  gmmapFileName,
  legendEntries,
  legendFileName,
  pngFileName,
  safeFileName,
  stripLayout,
} from "./exportLayout";
import { parseGmmapFile, toGmmapFile } from "./gmmapFile";
import { addRegion, cellTypeAt, createModel, paintCells } from "./grid";
import type { ObjectDef } from "./objects";

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";
const table: ObjectDef = {
  id: "table-id",
  name: "Стол",
  width: 2,
  height: 1,
  color: "#8a5a2b",
  symbol: { kind: "image", value: PIXEL },
  blocksMove: true,
  blocksSight: false,
};
const stool: ObjectDef = { ...table, id: "stool-id", name: "Табурет", width: 1, symbol: null };

const lava: CellType = {
  id: "lava-id",
  builtin: false,
  name: "Лава",
  color: "#ff4400",
  pattern: "none",
  symbol: { kind: "letter", value: "Л" },
  blocksMove: true,
  blocksSight: "no",
  comment: "2d6 огнём за ход",
};
const unused: CellType = { ...lava, id: "unused", name: "Пусто" };
const types: CellType[] = [...BUILTIN_TYPES.map((t) => ({ ...t, name: t.id })), lava, unused];
const typeOf = makeTypeLookup(types);

describe("export file names", () => {
  it("puts the size in cells and pixels into the name", () => {
    expect(pngFileName("Склеп", 30, 20, 70)).toBe("Склеп_30x20_70px.png");
    expect(legendFileName("Склеп", "легенда")).toBe("Склеп_легенда.png");
    expect(gmmapFileName("Склеп")).toBe("Склеп.gmmap.json");
  });

  it("removes characters Windows does not allow", () => {
    expect(safeFileName('Башня: этаж 2/3 "Сокровищница"?')).toBe("Башня_ этаж 2_3 _Сокровищница__");
    expect(safeFileName("  Карта.  ")).toBe("Карта");
    expect(safeFileName("...")).toBe("map");
  });

  it("checks canvas limits", () => {
    expect(fitsCanvas(30 * 140, 20 * 140)).toBe(true);
    expect(fitsCanvas(200 * 140, 200 * 140)).toBe(false);
    expect(fitsCanvas(200 * 70, 200 * 70)).toBe(true);
  });
});

describe("legend", () => {
  it("lists the visible types in palette order and named regions", () => {
    let m = paintCells(createModel(10, 10, { perimeter: true }), [11], "lava-id");
    m = addRegion(m, "r", { name: "Пруд", typeId: "water", note: "", labelVisible: true }, [22]);
    m = addRegion(m, "r2", { name: " ", typeId: "floor", note: "", labelVisible: true }, [33]);
    m = {
      ...m,
      objects: [
        { id: "a", defId: "stool-id", x: 1, y: 1, rotation: 0 },
        { id: "b", defId: "table-id", x: 2, y: 1, rotation: 0 },
        { id: "c", defId: "deleted", x: 3, y: 1, rotation: 0 },
        { id: "d", defId: "stool-id", x: 4, y: 1, rotation: 0 },
      ],
    };
    const legend = legendEntries(m, types, typeOf, [table, stool]);
    expect(legend.types.map((t) => t.id)).toEqual(["floor", "wall", "water", "lava-id"]);
    expect(legend.regions.map((r) => [r.name, r.type?.id])).toEqual([["Пруд", "water"]]);
    expect(legend.objects.map((d) => d.id)).toEqual(["stool-id", "table-id"]);
  });

  it("keeps the strip aligned to the cell grid", () => {
    const layout = stripLayout({ width: 30, height: 4 }, 70, { width: 300, height: 500 });
    expect(layout).toEqual({ widthCells: 35, heightCells: 8, stripX: 2100, stripWidth: 350 });
  });
});

describe(".gmmap.json", () => {
  it("round-trips the map and the custom types it uses", () => {
    let m = paintCells(createModel(8, 6), [3, 4], "lava-id");
    m = { ...m, objects: [{ id: "o", defId: "table-id", x: 1, y: 1, rotation: 90 }] };
    m = addRegion(m, "r", { name: "Алтарь", typeId: "lava-id", note: "", labelVisible: true }, [9]);
    const file = toGmmapFile({ name: "Склеп", description: "сыро" }, m, types, [table, stool]);
    expect(file.customTypes.map((t) => t.id)).toEqual(["lava-id"]);

    const back = parseGmmapFile(JSON.stringify(file));
    expect(back.name).toBe("Склеп");
    expect(back.description).toBe("сыро");
    expect(cellTypeAt(back.model, 3)).toBe("lava-id");
    expect(back.model.regions).toEqual(m.regions);
    expect(back.customTypes[0]).toMatchObject({
      name: "Лава",
      symbol: "Л",
      blocksMove: true,
      comment: "2d6 огнём за ход",
      image: "",
    });
    expect(back.model.objects).toEqual(m.objects);
    expect(back.objects).toEqual([
      {
        id: "table-id",
        name: "Стол",
        width: 2,
        height: 1,
        color: "#8a5a2b",
        symbol: "",
        image: PIXEL,
        blocksMove: true,
        blocksSight: false,
      },
    ]);
  });

  it("reads version 1 files", () => {
    const v2 = toGmmapFile({ name: "Старая", description: "" }, createModel(5, 5), types, []);
    const { objects, ...mapV2 } = v2.map;
    expect(objects).toEqual([]);
    const v1 = { ...v2, version: 1, objects: undefined, map: { ...mapV2, version: 1 } };
    const back = parseGmmapFile(JSON.stringify(v1));
    expect(back.name).toBe("Старая");
    expect(back.objects).toEqual([]);
    expect(back.model.objects).toEqual([]);
  });

  it("rejects other files", () => {
    expect(() => parseGmmapFile("not json")).toThrow();
    expect(() => parseGmmapFile(JSON.stringify({ format: "other" }))).toThrow();
    const file = toGmmapFile({ name: "x", description: "" }, createModel(5, 5), types, []);
    expect(() => parseGmmapFile(JSON.stringify({ ...file, version: 9 }))).toThrow(/version/);
  });

  it("drops invalid custom types and never overrides built-ins", () => {
    const file = {
      ...toGmmapFile({ name: "x", description: "" }, createModel(5, 5), types, []),
      customTypes: [
        { id: "wall", name: "Не стена", color: "#000000" },
        { id: "a", name: "", color: "#000000" },
        { id: "b", name: "Б", color: "red", symbol: "zz" },
      ],
    };
    const parsed = parseGmmapFile(JSON.stringify(file));
    expect(parsed.customTypes).toEqual([
      {
        id: "b",
        name: "Б",
        color: "#808080",
        symbol: "z",
        blocksMove: false,
        blocksSight: false,
        comment: "",
        image: "",
      },
    ]);
  });
});
