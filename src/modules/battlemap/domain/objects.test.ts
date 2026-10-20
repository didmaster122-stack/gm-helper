import { describe, expect, it } from "vitest";
import { createModel, resizeModel } from "./grid";
import { fitWithin, isImageDataUrl } from "./images";
import {
  addObject,
  footprint,
  moveObjects,
  objectAt,
  removeObjects,
  rotateObjects,
  usedObjectDefs,
  type ObjectSizeOf,
} from "./objects";

const sizes: Record<string, { width: number; height: number }> = {
  table: { width: 2, height: 1 },
  altar: { width: 3, height: 3 },
};
const sizeOf: ObjectSizeOf = (id) => sizes[id] ?? null;

function tavern() {
  let m = createModel(10, 8);
  m = addObject(m, sizeOf, { id: "t1", defId: "table", x: 1, y: 1, rotation: 0 });
  m = addObject(m, sizeOf, { id: "t2", defId: "table", x: 1, y: 1, rotation: 90 });
  return m;
}

describe("map objects", () => {
  it("swaps the sides on a quarter turn and treats deleted objects as 1×1", () => {
    expect(footprint(sizes.table ?? null, 0)).toEqual({ w: 2, h: 1 });
    expect(footprint(sizes.table ?? null, 90)).toEqual({ w: 1, h: 2 });
    expect(footprint(sizes.table ?? null, 180)).toEqual({ w: 2, h: 1 });
    expect(footprint(null, 270)).toEqual({ w: 1, h: 1 });
  });

  it("keeps a placed object on the map", () => {
    const m = addObject(createModel(10, 8), sizeOf, {
      id: "a",
      defId: "altar",
      x: 9,
      y: 7,
      rotation: 0,
    });
    expect(m.objects[0]).toMatchObject({ x: 7, y: 5 });
    expect(() =>
      addObject(m, sizeOf, { id: "a", defId: "table", x: 0, y: 0, rotation: 0 }),
    ).toThrow();
  });

  it("finds the topmost object under a cell (objects may overlap)", () => {
    const m = tavern();
    expect(objectAt(m, sizeOf, 1, 1)?.id).toBe("t2");
    expect(objectAt(m, sizeOf, 2, 1)?.id).toBe("t1");
    expect(objectAt(m, sizeOf, 1, 2)?.id).toBe("t2");
    expect(objectAt(m, sizeOf, 2, 2)).toBeNull();
  });

  it("moves, rotates and removes the given objects only", () => {
    let m = tavern();
    m = moveObjects(m, sizeOf, new Set(["t1"]), 3, 2);
    expect(m.objects.map((o) => [o.x, o.y])).toEqual([
      [4, 3],
      [1, 1],
    ]);
    // Clamped at the edge.
    m = moveObjects(m, sizeOf, new Set(["t1"]), 100, 0);
    expect(m.objects[0]?.x).toBe(8);
    m = rotateObjects(m, sizeOf, new Set(["t1"]));
    expect(m.objects[0]).toMatchObject({ rotation: 90, x: 8 });
    m = rotateObjects(m, sizeOf, new Set(["t1"]));
    m = rotateObjects(m, sizeOf, new Set(["t1"]));
    m = rotateObjects(m, sizeOf, new Set(["t1"]));
    expect(m.objects[0]?.rotation).toBe(0);
    m = removeObjects(m, new Set(["t2"]));
    expect(m.objects.map((o) => o.id)).toEqual(["t1"]);
  });

  it("returns the same model when nothing changes", () => {
    const m = tavern();
    expect(moveObjects(m, sizeOf, new Set(["t1"]), 0, 0)).toBe(m);
    expect(moveObjects(m, sizeOf, new Set(["t1"]), -5, 0)).not.toBe(m);
    expect(rotateObjects(m, sizeOf, new Set(["nope"]))).toBe(m);
    expect(removeObjects(m, new Set(["nope"]))).toBe(m);
  });

  it("moves objects when the map is resized and drops cropped ones", () => {
    const m = tavern();
    const grown = resizeModel(m, { left: 2, top: 1, right: 0, bottom: 0 });
    expect(grown.objects.map((o) => [o.x, o.y])).toEqual([
      [3, 2],
      [3, 2],
    ]);
    const cropped = resizeModel(m, { left: -2, top: 0, right: 0, bottom: 0 });
    expect(cropped.objects).toEqual([]);
  });

  it("lists the catalog objects a map uses", () => {
    expect(usedObjectDefs(tavern())).toEqual(["table"]);
  });
});

describe("custom pictures", () => {
  it("downscales to 256 px on the longer side without upscaling", () => {
    expect(fitWithin(1024, 512)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(300, 1200)).toEqual({ width: 64, height: 256 });
    expect(fitWithin(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(5000, 1)).toEqual({ width: 256, height: 1 });
  });

  it("accepts only image data URLs", () => {
    expect(isImageDataUrl("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isImageDataUrl("data:text/html;base64,PGI+")).toBe(false);
    expect(isImageDataUrl("https://example.com/a.png")).toBe(false);
    expect(isImageDataUrl(42)).toBe(false);
  });
});
