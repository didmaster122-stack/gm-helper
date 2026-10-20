import { describe, expect, it } from "vitest";
import { fitView, screenToCell, visibleCells, zoomAt } from "./view";

describe("view", () => {
  it("maps screen points to cells", () => {
    const view = { x: 10, y: 20, zoom: 1 };
    expect(screenToCell(view, 10, 20)).toEqual({ x: 0, y: 0 });
    expect(screenToCell(view, 58, 44)).toEqual({ x: 2, y: 1 });
    expect(screenToCell(view, 9, 20)).toEqual({ x: -1, y: 0 });
  });

  it("keeps the point under the cursor when zooming", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const zoomed = zoomAt(view, 2, 100, 50);
    expect(screenToCell(zoomed, 100, 50)).toEqual(screenToCell(view, 100, 50));
    expect(zoomAt(view, 100, 0, 0).zoom).toBe(4);
  });

  it("fits a map into the viewport without enlarging it", () => {
    const small = fitView({ width: 10, height: 10 }, { width: 1000, height: 800 });
    expect(small.zoom).toBe(1);
    expect(small.x).toBe(380);
    const big = fitView({ width: 200, height: 200 }, { width: 1000, height: 800 });
    expect(big.zoom).toBeLessThan(0.2);
  });

  it("clips the visible range to the map", () => {
    const range = visibleCells(
      { x: -48, y: 0, zoom: 1 },
      { width: 10, height: 10 },
      {
        width: 120,
        height: 1000,
      },
    );
    expect(range).toEqual({ x0: 2, y0: 0, x1: 7, y1: 9 });
  });
});
