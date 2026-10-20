import { describe, expect, it } from "vitest";
import {
  clampCrop,
  cropRegion,
  DEFAULT_CROP,
  imagePlacement,
  panCrop,
  sliderToZoom,
  zoomCropAt,
  zoomLimits,
  zoomToSlider,
} from "./tokenCrop";

const PORTRAIT = { width: 1000, height: 2000 };

describe("cropRegion", () => {
  it("fits the shorter side at zoom 1, centred", () => {
    expect(cropRegion(DEFAULT_CROP, PORTRAIT)).toEqual({
      x: 0,
      y: 500,
      width: 1000,
      height: 1000,
    });
  });

  it("shrinks with zoom around the centre", () => {
    expect(cropRegion({ centerX: 0.25, centerY: 0.1, zoom: 4 }, PORTRAIT)).toEqual({
      x: 125,
      y: 75,
      width: 250,
      height: 250,
    });
  });

  it("may extend past the image when zoomed out", () => {
    const region = cropRegion({ centerX: 0.5, centerY: 0.5, zoom: 0.5 }, PORTRAIT);
    expect(region.x).toBe(-500);
    expect(region.width).toBe(2000);
  });
});

describe("imagePlacement", () => {
  it("scales the image so the crop region fills the output", () => {
    const p = imagePlacement({ centerX: 0.25, centerY: 0.1, zoom: 4 }, PORTRAIT, 500);
    // 250 source px → 500 output px: factor 2.
    expect(p).toEqual({ x: -250, y: -150, width: 2000, height: 4000 });
  });

  it("centres a square image at zoom 1 exactly", () => {
    expect(imagePlacement(DEFAULT_CROP, { width: 800, height: 800 }, 512)).toEqual({
      x: 0,
      y: 0,
      width: 512,
      height: 512,
    });
  });
});

describe("limits and clamping", () => {
  it("allows zooming out until the whole image fits in the circle", () => {
    const { min, max } = zoomLimits(PORTRAIT);
    expect(min).toBeCloseTo(1000 / Math.hypot(1000, 2000));
    expect(max).toBe(20);
  });

  it("never forces zooming in on tiny images", () => {
    expect(zoomLimits({ width: 16, height: 16 }).max).toBe(1);
  });

  it("keeps the centre inside the image and repairs bad values", () => {
    expect(clampCrop({ centerX: -1, centerY: 2, zoom: 100 }, PORTRAIT)).toEqual({
      centerX: 0,
      centerY: 1,
      zoom: 20,
    });
    expect(clampCrop({ centerX: NaN, centerY: Infinity, zoom: NaN }, PORTRAIT)).toEqual(
      DEFAULT_CROP,
    );
  });
});

describe("editor gestures", () => {
  it("pans: dragging right moves the visible area left", () => {
    // View circle 500 px shows 1000 source px: 1 screen px = 2 source px.
    const next = panCrop(DEFAULT_CROP, 100, -50, 500, PORTRAIT);
    expect(next.centerX).toBeCloseTo((500 - 200) / 1000);
    expect(next.centerY).toBeCloseTo((1000 + 100) / 2000);
    expect(next.zoom).toBe(1);
  });

  it("zooms keeping the point under the pointer fixed", () => {
    const image = PORTRAIT;
    const view = 400;
    const crop = { centerX: 0.4, centerY: 0.3, zoom: 1.5 };
    const px = 120;
    const py = -80;
    const pointAt = (c: typeof crop) => {
      const k = cropDiameter(c) / view;
      return [c.centerX * image.width + px * k, c.centerY * image.height + py * k];
    };
    const cropDiameter = (c: typeof crop) => Math.min(image.width, image.height) / c.zoom;

    const next = zoomCropAt(crop, 3, px, py, view, image);
    expect(next.zoom).toBe(3);
    const [x0, y0] = pointAt(crop);
    const [x1, y1] = pointAt(next);
    expect(x1).toBeCloseTo(x0 ?? NaN);
    expect(y1).toBeCloseTo(y0 ?? NaN);
  });

  it("zooming at the centre does not move it", () => {
    const next = zoomCropAt(DEFAULT_CROP, 2, 0, 0, 400, PORTRAIT);
    expect(next).toEqual({ centerX: 0.5, centerY: 0.5, zoom: 2 });
  });

  it("maps the zoom slider logarithmically and back", () => {
    const { min, max } = zoomLimits(PORTRAIT);
    expect(sliderToZoom(0, PORTRAIT)).toBeCloseTo(min);
    expect(sliderToZoom(1, PORTRAIT)).toBeCloseTo(max);
    expect(sliderToZoom(zoomToSlider(2.5, PORTRAIT), PORTRAIT)).toBeCloseTo(2.5);
  });
});
