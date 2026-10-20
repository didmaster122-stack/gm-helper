import { describe, expect, it } from "vitest";
import {
  autoCrop,
  faceCrop,
  pickFace,
  regionToImage,
  ruleCrop,
  scaledSize,
  searchRegions,
} from "./autoCrop";
import { cropRegion, zoomLimits, type ImageSize, type TokenCrop } from "./tokenCrop";

const PORTRAIT = { width: 1000, height: 2000 };
const LANDSCAPE = { width: 1600, height: 900 };
const SQUARE = { width: 800, height: 800 };

/** The circle (its bounding square) lies within the image. */
function inside(crop: TokenCrop, image: ImageSize): boolean {
  const r = cropRegion(crop, image);
  const eps = 1e-9;
  return (
    r.x >= -eps &&
    r.y >= -eps &&
    r.x + r.width <= image.width + eps &&
    r.y + r.height <= image.height + eps
  );
}

describe("faceCrop", () => {
  it("centres on the head with a margin, slightly above the face box centre", () => {
    const crop = faceCrop({ x: 450, y: 400, width: 100, height: 100 }, PORTRAIT);
    expect(crop.centerX).toBeCloseTo(0.5);
    expect(crop.centerY * PORTRAIT.height).toBeCloseTo(435);
    // Diameter 220 px of the 1000 px short side.
    expect(crop.zoom).toBeCloseTo(1000 / 220);
    expect(inside(crop, PORTRAIT)).toBe(true);
  });

  it("moves the circle inside when the face is at the edge", () => {
    const crop = faceCrop({ x: 0, y: 0, width: 120, height: 120 }, SQUARE);
    expect(inside(crop, SQUARE)).toBe(true);
    const region = cropRegion(crop, SQUARE);
    expect(region.x).toBeCloseTo(0);
    expect(region.y).toBeCloseTo(0);
  });

  it("never grows past the short side", () => {
    const crop = faceCrop({ x: 100, y: 100, width: 600, height: 700 }, SQUARE);
    expect(crop.zoom).toBe(1);
    expect(inside(crop, SQUARE)).toBe(true);
  });

  it("keeps a tiny face within the zoom limit", () => {
    const crop = faceCrop({ x: 500, y: 500, width: 2, height: 2 }, SQUARE);
    expect(crop.zoom).toBeCloseTo(zoomLimits(SQUARE).max);
  });
});

describe("ruleCrop", () => {
  it("puts the circle near the top of a vertical art", () => {
    const crop = ruleCrop(PORTRAIT);
    expect(crop.zoom).toBe(1);
    expect(crop.centerX).toBe(0.5);
    // 500 (radius) + 10% of the 1000 px below the circle.
    expect(crop.centerY * PORTRAIT.height).toBeCloseTo(600);
    expect(inside(crop, PORTRAIT)).toBe(true);
  });

  it("centres the circle on wide and square arts", () => {
    expect(ruleCrop(LANDSCAPE)).toEqual({ centerX: 0.5, centerY: 0.5, zoom: 1 });
    expect(ruleCrop(SQUARE)).toEqual({ centerX: 0.5, centerY: 0.5, zoom: 1 });
  });
});

describe("pickFace", () => {
  it("returns the largest face or null", () => {
    expect(pickFace([])).toBeNull();
    const small = { x: 0, y: 0, width: 10, height: 10, score: 0.99 };
    const large = { x: 50, y: 50, width: 40, height: 30, score: 0.6 };
    expect(pickFace([small, large])).toBe(large);
  });
});

describe("autoCrop", () => {
  it("reports how the circle was chosen", () => {
    expect(autoCrop([], PORTRAIT).method).toBe("rule");
    const face = { x: 400, y: 300, width: 200, height: 200, score: 0.9 };
    expect(autoCrop([face], PORTRAIT)).toEqual({
      crop: faceCrop(face, PORTRAIT),
      method: "face",
    });
  });
});

describe("searchRegions", () => {
  it("searches only the whole of a near-square art", () => {
    expect(searchRegions(SQUARE)).toEqual([{ x: 0, y: 0, width: 800, height: 800 }]);
  });

  it("adds the top of a vertical art", () => {
    expect(searchRegions(PORTRAIT)).toEqual([
      { x: 0, y: 0, width: 1000, height: 2000 },
      { x: 0, y: 0, width: 1000, height: 1000 },
      { x: 200, y: 0, width: 600, height: 600 },
    ]);
  });

  it("adds the middle of a wide art", () => {
    expect(searchRegions(LANDSCAPE)[1]).toEqual({ x: 350, y: 0, width: 900, height: 900 });
  });
});

describe("regionToImage / scaledSize", () => {
  it("maps a box from a scaled region back to image pixels", () => {
    const region = { x: 200, y: 0, width: 600, height: 600 };
    const scaled = scaledSize(region, 300);
    expect(scaled).toEqual({ width: 300, height: 300 });
    const box = regionToImage({ x: 30, y: 60, width: 50, height: 40, score: 0.8 }, region, scaled);
    expect(box).toEqual({ x: 260, y: 120, width: 100, height: 80, score: 0.8 });
  });

  it("does not upscale small regions", () => {
    expect(scaledSize({ x: 0, y: 0, width: 120, height: 80 }, 512)).toEqual({
      width: 120,
      height: 80,
    });
  });
});
