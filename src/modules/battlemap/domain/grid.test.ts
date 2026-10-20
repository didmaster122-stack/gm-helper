import { describe, expect, it } from "vitest";
import {
  addCellsToRegion,
  addRegion,
  cellIndex,
  cellTypeAt,
  createModel,
  deleteRegion,
  effectiveTypeAt,
  floodCells,
  isConnected,
  labelCell,
  lineCells,
  outlineSegments,
  paintCells,
  rectCells,
  regionLookup,
  releaseCells,
  removeCellsFromRegion,
  resizeModel,
  type BattlemapModel,
  type RegionProps,
} from "./grid";

const props = (name: string, typeId = "floor"): RegionProps => ({
  name,
  typeId,
  note: "",
  labelVisible: true,
});

function types(m: BattlemapModel): string {
  const rows: string[] = [];
  for (let y = 0; y < m.height; y++) {
    let row = "";
    for (let x = 0; x < m.width; x++) row += cellTypeAt(m, cellIndex(m, x, y))[0];
    rows.push(row);
  }
  return rows.join("\n");
}

describe("createModel", () => {
  it("creates an empty floor map", () => {
    const m = createModel(5, 6);
    expect(m.cells).toHaveLength(30);
    expect(types(m).replace(/\n/g, "")).toBe("f".repeat(30));
    expect(m.regions).toEqual([]);
  });

  it("can surround the map with walls", () => {
    const m = createModel(5, 5, { perimeter: true });
    expect(types(m)).toBe(["wwwww", "wfffw", "wfffw", "wfffw", "wwwww"].join("\n"));
  });

  it("rejects sizes outside 5..200", () => {
    expect(() => createModel(4, 10)).toThrow();
    expect(() => createModel(10, 201)).toThrow();
    expect(() => createModel(5.5, 10)).toThrow();
    expect(() => createModel(200, 200)).not.toThrow();
  });
});

describe("painting", () => {
  it("paints cells and adds new types to the palette", () => {
    const m = paintCells(createModel(5, 5), [0, 6], "water");
    expect(cellTypeAt(m, 0)).toBe("water");
    expect(cellTypeAt(m, 6)).toBe("water");
    expect(cellTypeAt(m, 1)).toBe("floor");
    expect(m.palette).toContain("water");
  });

  it("returns the same model when nothing changes", () => {
    const m = createModel(5, 5);
    expect(paintCells(m, [0, 1], "floor")).toBe(m);
    expect(paintCells(m, [], "water")).toBe(m);
  });

  it("does not mutate the original model", () => {
    const m = createModel(5, 5);
    paintCells(m, [0], "wall");
    expect(cellTypeAt(m, 0)).toBe("floor");
  });

  it("builds rectangles from any two corners and clips them", () => {
    const m = createModel(5, 5);
    expect(rectCells(m, { x: 2, y: 1 }, { x: 1, y: 2 })).toEqual([6, 7, 11, 12]);
    expect(rectCells(m, { x: 3, y: 3 }, { x: 9, y: 9 })).toEqual([18, 19, 23, 24]);
  });

  it("draws lines without gaps", () => {
    const m = createModel(10, 10);
    expect(lineCells(m, { x: 0, y: 0 }, { x: 4, y: 0 })).toEqual([0, 1, 2, 3, 4]);
    expect(lineCells(m, { x: 0, y: 0 }, { x: 3, y: 3 })).toHaveLength(4);
  });

  it("flood fills the connected area of the same type only", () => {
    // Wall column at x = 2 splits the map in two.
    let m = createModel(5, 5);
    m = paintCells(m, rectCells(m, { x: 2, y: 0 }, { x: 2, y: 4 }), "wall");
    const left = floodCells(m, 0);
    expect(left).toHaveLength(10);
    expect(left.every((c) => c % 5 < 2)).toBe(true);
    expect(floodCells(m, 2)).toHaveLength(5);
  });
});

describe("regions", () => {
  it("keeps the cells' own types when the region has no type (an area)", () => {
    const m = addRegion(
      paintCells(createModel(5, 5), [1], "water"),
      "a",
      { name: "Алтарь", typeId: null, note: "", labelVisible: true },
      [0, 1],
    );
    const lookup = regionLookup(m);
    expect(effectiveTypeAt(m, lookup, 0)).toBe("floor");
    expect(effectiveTypeAt(m, lookup, 1)).toBe("water");
  });

  it("creates a region whose type overrides the cells' own type", () => {
    const m = addRegion(createModel(5, 5), "r1", props("Вода", "water"), [3, 1, 2, 2]);
    expect(m.regions[0]?.cells).toEqual([1, 2, 3]);
    const lookup = regionLookup(m);
    expect(effectiveTypeAt(m, lookup, 2)).toBe("water");
    expect(effectiveTypeAt(m, lookup, 4)).toBe("floor");
    expect(cellTypeAt(m, 2)).toBe("floor");
  });

  it("ignores an empty selection and cells outside the map", () => {
    const m = createModel(5, 5);
    expect(addRegion(m, "r1", props("x"), [])).toBe(m);
    expect(addRegion(m, "r1", props("x"), [-1, 99, 3]).regions[0]?.cells).toEqual([3]);
  });

  it("keeps each cell in at most one region", () => {
    let m = addRegion(createModel(5, 5), "a", props("A"), [0, 1, 2]);
    m = addRegion(m, "b", props("B"), [2, 3]);
    expect(m.regions.find((r) => r.id === "a")?.cells).toEqual([0, 1]);
    expect(m.regions.find((r) => r.id === "b")?.cells).toEqual([2, 3]);

    m = addCellsToRegion(m, "a", [3]);
    expect(m.regions.find((r) => r.id === "a")?.cells).toEqual([0, 1, 3]);
    expect(m.regions.find((r) => r.id === "b")?.cells).toEqual([2]);

    const lookup = regionLookup(m);
    const owners = m.regions.flatMap((r) => r.cells);
    expect(new Set(owners).size).toBe(owners.length);
    expect(lookup[3]).toBe(m.regions.findIndex((r) => r.id === "a"));
  });

  it("removes a region that lost all its cells to another one", () => {
    let m = addRegion(createModel(5, 5), "a", props("A"), [0, 1]);
    m = addRegion(m, "b", props("B"), [0, 1, 2]);
    expect(m.regions.map((r) => r.id)).toEqual(["b"]);
  });

  it("removes cells and deletes the region when it becomes empty", () => {
    let m = addRegion(createModel(5, 5), "a", props("A"), [0, 1]);
    m = removeCellsFromRegion(m, "a", [0]);
    expect(m.regions[0]?.cells).toEqual([1]);
    m = removeCellsFromRegion(m, "a", [1]);
    expect(m.regions).toEqual([]);
  });

  it("deleting a region gives the cells their own type back", () => {
    let m = paintCells(createModel(5, 5), [0], "wall");
    m = addRegion(m, "a", props("A", "water"), [0, 1]);
    m = deleteRegion(m, "a");
    const lookup = regionLookup(m);
    expect(effectiveTypeAt(m, lookup, 0)).toBe("wall");
    expect(effectiveTypeAt(m, lookup, 1)).toBe("floor");
  });

  it("releaseCells takes cells out of any region", () => {
    let m = addRegion(createModel(5, 5), "a", props("A"), [0, 1]);
    m = addRegion(m, "b", props("B"), [5]);
    m = releaseCells(m, [1, 5]);
    expect(m.regions.map((r) => [r.id, r.cells])).toEqual([["a", [0]]]);
  });

  it("detects disconnected regions", () => {
    expect(isConnected([], 5)).toBe(true);
    expect(isConnected([0, 1, 2, 7], 5)).toBe(true);
    expect(isConnected([0, 2], 5)).toBe(false);
    // Diagonal neighbours are not connected.
    expect(isConnected([0, 6], 5)).toBe(false);
    // Cells at the end of one row and the start of the next are not neighbours.
    expect(isConnected([4, 5], 5)).toBe(false);
  });

  it("outlines a region along its outer edges", () => {
    // Corridor of 3 cells: 2 long edges of 3 segments + 2 ends.
    expect(outlineSegments([0, 1, 2], 5)).toHaveLength(8);
    expect(outlineSegments([0], 5)).toHaveLength(4);
  });

  it("places the label near the centre", () => {
    expect(labelCell([0, 1, 2, 3, 4], 5)).toBe(2);
    expect(labelCell([], 5)).toBeNull();
  });
});

describe("resizeModel", () => {
  it("adds floor cells on any side and keeps content in place", () => {
    let m = paintCells(createModel(5, 5), [0], "wall");
    m = addRegion(m, "a", props("A"), [0, 1]);
    const r = resizeModel(m, { left: 2, top: 1, right: 0, bottom: 3 });
    expect([r.width, r.height]).toEqual([7, 9]);
    expect(cellTypeAt(r, cellIndex(r, 2, 1))).toBe("wall");
    expect(cellTypeAt(r, cellIndex(r, 0, 0))).toBe("floor");
    expect(r.regions[0]?.cells).toEqual([cellIndex(r, 2, 1), cellIndex(r, 3, 1)]);
  });

  it("crops cells and drops regions that end up empty", () => {
    let m = paintCells(createModel(6, 6), [cellIndex({ width: 6 }, 5, 5)], "wall");
    m = addRegion(m, "a", props("A"), [0]);
    m = addRegion(m, "b", props("B"), [1, 2]);
    const r = resizeModel(m, { left: -1, top: 0, right: 0, bottom: 0 });
    expect(r.width).toBe(5);
    expect(cellTypeAt(r, cellIndex(r, 4, 5))).toBe("wall");
    expect(r.regions.map((x) => [x.id, x.cells])).toEqual([["b", [0, 1]]]);
  });

  it("rejects sizes outside the limits", () => {
    expect(() =>
      resizeModel(createModel(5, 5), { left: -1, top: 0, right: 0, bottom: 0 }),
    ).toThrow();
  });
});
