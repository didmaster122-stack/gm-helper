import { describe, expect, it } from "vitest";
import {
  clampCrossfade,
  fadeGain,
  makeOrder,
  nextPosition,
  previousPosition,
  reorder,
} from "./queue";

/** Deterministic "random" numbers for shuffles. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("makeOrder", () => {
  it("keeps the list order without shuffle", () => {
    expect(makeOrder(4, 2, false)).toEqual([0, 1, 2, 3]);
  });

  it("starts a shuffle with the picked track and contains every track once", () => {
    const order = makeOrder(6, 3, true, seq(0.9, 0.1, 0.5, 0.3));
    expect(order[0]).toBe(3);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("handles empty and single lists", () => {
    expect(makeOrder(0, 0, true)).toEqual([]);
    expect(makeOrder(1, 0, true)).toEqual([0]);
  });
});

describe("nextPosition", () => {
  it("advances and stops at the end without repeat", () => {
    expect(nextPosition(0, 3, "off", false)).toBe(1);
    expect(nextPosition(2, 3, "off", false)).toBeNull();
  });

  it("wraps around when the list repeats", () => {
    expect(nextPosition(2, 3, "all", false)).toBe(0);
  });

  it("holds one track on repeat-one unless the user skips", () => {
    expect(nextPosition(1, 3, "one", false)).toBe(1);
    expect(nextPosition(1, 3, "one", true)).toBe(2);
    expect(nextPosition(2, 3, "one", true)).toBe(0);
  });

  it("has nothing to play in an empty queue", () => {
    expect(nextPosition(0, 0, "all", true)).toBeNull();
  });
});

describe("previousPosition", () => {
  it("goes back and wraps only with repeat", () => {
    expect(previousPosition(2, 3, "off")).toBe(1);
    expect(previousPosition(0, 3, "off")).toBeNull();
    expect(previousPosition(0, 3, "all")).toBe(2);
  });
});

describe("reorder", () => {
  it("keeps the current track playing when shuffle is turned on", () => {
    const { order, pos } = reorder([0, 1, 2, 3], 2, true, seq(0.4, 0.7));
    expect(order[pos]).toBe(2);
    expect(pos).toBe(0);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });

  it("returns to list order at the current track when shuffle is turned off", () => {
    const { order, pos } = reorder([3, 0, 2, 1], 1, false);
    expect(order).toEqual([0, 1, 2, 3]);
    expect(order[pos]).toBe(0);
  });
});

describe("fades", () => {
  it("interpolates the volume over the fade", () => {
    expect(fadeGain(0, 1, 0, 3)).toBe(0);
    expect(fadeGain(0, 1, 1.5, 3)).toBeCloseTo(0.5);
    expect(fadeGain(1, 0, 3, 3)).toBe(0);
    expect(fadeGain(1, 0, 5, 0)).toBe(0);
  });

  it("keeps the crossfade within 0..10 whole seconds", () => {
    expect(clampCrossfade(-2)).toBe(0);
    expect(clampCrossfade(3.4)).toBe(3);
    expect(clampCrossfade(42)).toBe(10);
    expect(clampCrossfade(Number.NaN)).toBe(0);
  });
});
