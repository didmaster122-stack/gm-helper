import { describe, expect, it } from "vitest";
import { decodeSymbol, encodeSymbol } from "./cellTypes";
import { fromJson, toJson } from "./format";
import { addRegion, cellTypeAt, createModel, paintCells } from "./grid";
import { applySelection } from "./selection";
import { initHistory, pushHistory, redo, replacePresent, undo } from "./history";

describe("battlemap JSON", () => {
  it("round-trips a map with regions", () => {
    let m = createModel(20, 10, { perimeter: true });
    m = paintCells(m, [21, 22, 23], "water");
    m = addRegion(
      m,
      "r1",
      { name: "Коридор", typeId: "floor", note: "тихо", labelVisible: false },
      [41, 42],
    );
    const json = JSON.parse(JSON.stringify(toJson(m))) as unknown;
    const back = fromJson(json);
    expect(back.width).toBe(20);
    expect(back.height).toBe(10);
    for (let i = 0; i < 200; i++) expect(cellTypeAt(back, i)).toBe(cellTypeAt(m, i));
    expect(back.regions).toEqual(m.regions);
  });

  it("stores the version and compresses runs", () => {
    const json = toJson(createModel(200, 200));
    expect(json.version).toBe(2);
    expect(json.cells).toEqual([0, 40000]);
    expect(json.palette).toEqual(["floor"]);
  });

  it("round-trips placed objects", () => {
    const m = {
      ...createModel(10, 10),
      objects: [
        { id: "o1", defId: "table", x: 2, y: 3, rotation: 90 as const },
        { id: "o2", defId: "altar", x: 0, y: 0, rotation: 0 as const },
      ],
    };
    const back = fromJson(JSON.parse(JSON.stringify(toJson(m))) as unknown);
    expect(back.objects).toEqual(m.objects);
  });

  it("converts version 1 maps (no objects)", () => {
    const { objects, ...v2 } = toJson(paintCells(createModel(6, 5), [7], "water"));
    expect(objects).toEqual([]);
    const v1 = { ...v2, version: 1 };
    const back = fromJson(v1);
    expect(back.objects).toEqual([]);
    expect(cellTypeAt(back, 7)).toBe("water");
    expect(toJson(back).version).toBe(2);
  });

  it("drops objects off the map and rejects broken ones", () => {
    const good = toJson(createModel(5, 5));
    const off = { id: "o", defId: "d", x: 9, y: 0, rotation: 0 };
    expect(fromJson({ ...good, objects: [off] }).objects).toEqual([]);
    const odd = { id: "o", defId: "d", x: 1, y: 1, rotation: 45 };
    expect(fromJson({ ...good, objects: [odd] }).objects[0]?.rotation).toBe(0);
    expect(() => fromJson({ ...good, objects: [{ id: "o", x: 1, y: 1 }] })).toThrow();
    expect(() => fromJson({ ...good, objects: [odd, odd] })).toThrow(/duplicate/);
    expect(() => fromJson({ ...good, objects: undefined })).toThrow();
  });

  it("round-trips regions without a type and reads a missing type as none", () => {
    const m = addRegion(
      createModel(5, 5),
      "a",
      { name: "Зона", typeId: null, note: "", labelVisible: true },
      [3],
    );
    const json = JSON.parse(JSON.stringify(toJson(m))) as ReturnType<typeof toJson>;
    expect(fromJson(json).regions[0]?.typeId).toBeNull();
    const noType: Record<string, unknown> = { ...json.regions[0] };
    delete noType.typeId;
    expect(fromJson({ ...json, regions: [noType] }).regions[0]?.typeId).toBeNull();
    expect(() => fromJson({ ...json, regions: [{ ...noType, typeId: 5 }] })).toThrow();
  });

  it("drops unused palette entries", () => {
    const m = paintCells(paintCells(createModel(5, 5), [0], "water"), [0], "floor");
    expect(toJson(m).palette).toEqual(["floor"]);
  });

  it("rejects malformed data", () => {
    const good = toJson(createModel(5, 5));
    expect(() => fromJson(null)).toThrow();
    expect(() => fromJson({ ...good, version: 99 })).toThrow(/version/);
    expect(() => fromJson({ ...good, width: 3 })).toThrow();
    expect(() => fromJson({ ...good, cells: [0, 24] })).toThrow();
    expect(() => fromJson({ ...good, cells: [5, 25] })).toThrow();
    expect(() => fromJson({ ...good, regions: [{ id: "x" }] })).toThrow();
  });

  it("repairs cells claimed by two regions in a hand-edited file", () => {
    const json = {
      ...toJson(createModel(5, 5)),
      regions: [
        { id: "a", name: "A", typeId: "floor", note: "", labelVisible: true, cells: [0, 1] },
        { id: "b", name: "B", typeId: "floor", note: "", labelVisible: true, cells: [1, 2] },
        { id: "c", name: "C", typeId: "floor", note: "", labelVisible: true, cells: [99] },
      ],
    };
    expect(fromJson(json).regions.map((r) => r.cells)).toEqual([[0, 1], [2]]);
  });
});

describe("cell symbols", () => {
  it("encodes letters and icons", () => {
    expect(decodeSymbol(encodeSymbol({ kind: "letter", value: "Ж" }))).toEqual({
      kind: "letter",
      value: "Ж",
    });
    expect(decodeSymbol("star")).toEqual({ kind: "icon", value: "star" });
    expect(decodeSymbol("")).toBeNull();
  });
});

describe("selection", () => {
  it("replaces, adds and toggles", () => {
    const cur = new Set([1, 2]);
    expect([...applySelection(cur, [3], "replace")]).toEqual([3]);
    expect([...applySelection(cur, [2, 3], "add")].sort()).toEqual([1, 2, 3]);
    expect([...applySelection(cur, [2, 3], "toggle")].sort()).toEqual([1, 3]);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = initHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(undo(h)));
    expect(h.present).toBe(1);
  });

  it("drops the redo branch on a new edit and keeps the limit", () => {
    let h = pushHistory(pushHistory(initHistory(1), 2), 3);
    h = pushHistory(undo(h), 4);
    expect(redo(h).present).toBe(4);
    let big = initHistory(0);
    for (let i = 1; i <= 10; i++) big = pushHistory(big, i, 3);
    expect(big.past).toEqual([7, 8, 9]);
  });

  it("replacePresent continues the current step", () => {
    let h = pushHistory(initHistory(1), 2);
    h = replacePresent(h, 3);
    expect(undo(h).present).toBe(1);
  });
});
