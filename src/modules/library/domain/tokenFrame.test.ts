import { describe, expect, it } from "vitest";
import { frameRing, MAX_FRAME_WIDTH, NO_FRAME, normalizeFrame } from "./tokenFrame";
import { tokenPixelSize } from "./tokenCrop";

describe("token frame", () => {
  it("draws no ring without a width", () => {
    expect(frameRing(NO_FRAME, 512)).toBeNull();
  });

  it("measures the ring in percent of the radius", () => {
    expect(frameRing({ color: "#ffffff", width: 10 }, 512)).toEqual({ outer: 256, inner: 230.4 });
  });

  it("repairs stored values", () => {
    expect(normalizeFrame("#ABCDEF", 50)).toEqual({ color: "#abcdef", width: MAX_FRAME_WIDTH });
    expect(normalizeFrame("red", -1)).toEqual({ color: NO_FRAME.color, width: 0 });
    expect(normalizeFrame(undefined, Number.NaN)).toEqual(NO_FRAME);
  });
});

describe("token pixel size", () => {
  it("gives each cell the chosen resolution", () => {
    expect(tokenPixelSize(512, 1)).toBe(512);
    expect(tokenPixelSize(512, 2)).toBe(1024);
    expect(tokenPixelSize(1024, 4)).toBe(4096);
  });
});
