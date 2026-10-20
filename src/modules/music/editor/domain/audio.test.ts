import { describe, expect, it } from "vitest";
import { addClip, addSource, emptyProject, setLane } from "./project";
import { scheduleFrom } from "./schedule";
import { formatTime, rulerStep } from "./timeScale";
import { computePeaks, peakRange } from "./waveform";

describe("scheduleFrom", () => {
  let p = addSource(emptyProject(), {
    id: "s",
    trackId: "t",
    title: "s",
    relPath: "s.mp3",
    duration: 100,
  });
  p = addClip(p, "a", { sourceId: "s", offset: 5, length: 10 }, 0, 0);
  p = addClip(p, "b", { sourceId: "s", offset: 50, length: 10 }, 1, 20);
  p = setLane(p, 1, { muted: true });

  it("starts clips under the playhead mid-way and later ones with a delay", () => {
    expect(scheduleFrom(p, 4)).toEqual([
      { sourceId: "s", lane: 0, when: 0, offset: 9, duration: 6 },
      { sourceId: "s", lane: 1, when: 16, offset: 50, duration: 10 },
    ]);
  });

  it("skips clips that already ended", () => {
    expect(scheduleFrom(p, 25)).toEqual([
      { sourceId: "s", lane: 1, when: 0, offset: 55, duration: 5 },
    ]);
    expect(scheduleFrom(p, 30)).toEqual([]);
  });
});

describe("waveform peaks", () => {
  const rate = 10; // samples per second
  const left = Float32Array.from([0, 0.5, -0.2, 0, 0, 0, 0, 0, 0, 0, 0.1, -0.9]);
  const right = Float32Array.from([0, -0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  it("keeps min and max of all channels per bucket", () => {
    const peaks = computePeaks([left, right], rate, 2); // 5 samples per bucket
    expect(peaks.min.length).toBe(3);
    expect(peaks.max[0]).toBeCloseTo(0.5);
    expect(peaks.min[0]).toBeCloseTo(-0.6);
    expect(peaks.min[2]).toBeCloseTo(-0.9);
    expect(peaks.max[1]).toBe(0);
  });

  it("aggregates a time range and tolerates ranges outside the data", () => {
    const peaks = computePeaks([left, right], rate, 2);
    const [lo, hi] = peakRange(peaks, 0, 1.2);
    expect(lo).toBeCloseTo(-0.9);
    expect(hi).toBeCloseTo(0.5);
    expect(peakRange(peaks, 0.05, 0.06)[1]).toBeCloseTo(0.5);
    expect(peakRange(peaks, 10, 11)).toEqual([0, 0]);
  });
});

describe("time scale", () => {
  it("picks ruler steps that keep labels apart", () => {
    expect(rulerStep(100)).toBe(1);
    expect(rulerStep(8)).toBe(10);
    expect(rulerStep(0.5)).toBe(300);
  });

  it("formats times", () => {
    expect(formatTime(65.37)).toBe("1:05");
    expect(formatTime(65.37, true)).toBe("1:05.3");
    expect(formatTime(-1)).toBe("0:00");
  });
});
