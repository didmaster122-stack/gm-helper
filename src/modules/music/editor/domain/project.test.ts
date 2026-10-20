import { describe, expect, it } from "vitest";
import {
  addClip,
  addSource,
  clipEnd,
  clipsAt,
  duplicateClip,
  emptyProject,
  fitStart,
  MAX_SOURCES,
  MIN_CLIP_S,
  moveClip,
  projectDuration,
  removeClip,
  removeSource,
  setLane,
  snapClipStart,
  snapTargets,
  snapTime,
  splitClip,
  trimClip,
  type Clip,
  type EditorSource,
  type Project,
} from "./project";

const source = (id: string, duration = 60): EditorSource => ({
  id,
  trackId: `t-${id}`,
  title: id,
  relPath: `A/B/${id}.mp3`,
  duration,
});

const withSources = (...sources: EditorSource[]): Project =>
  sources.reduce(addSource, emptyProject());

function clip(project: Project, id: string): Clip {
  const found = project.clips.find((c) => c.id === id);
  if (!found) throw new Error(`no clip ${id}`);
  return found;
}

/** Project with clips a [0,10) and b [20,30) on lane 0. */
function twoClips(): Project {
  let p = withSources(source("music"));
  p = addClip(p, "a", { sourceId: "music", offset: 0, length: 10 }, 0, 0);
  p = addClip(p, "b", { sourceId: "music", offset: 30, length: 10 }, 0, 20);
  return p;
}

function noOverlaps(project: Project): boolean {
  for (const a of project.clips) {
    for (const b of project.clips) {
      if (a.id === b.id || a.lane !== b.lane) continue;
      if (a.start < clipEnd(b) - 1e-9 && b.start < clipEnd(a) - 1e-9) return false;
    }
  }
  return true;
}

describe("sources", () => {
  it("keeps at most three and no duplicates", () => {
    let p = withSources(source("a"), source("a"), source("b"), source("c"), source("d"));
    expect(p.sources.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(p.sources).toHaveLength(MAX_SOURCES);
    p = addClip(p, "x", { sourceId: "b", offset: 0, length: 5 }, 1, 0);
    p = removeSource(p, "b");
    expect(p.sources.map((s) => s.id)).toEqual(["a", "c"]);
    expect(p.clips).toEqual([]);
  });
});

describe("fitStart", () => {
  const others = [
    { id: "a", sourceId: "s", lane: 0, start: 0, offset: 0, length: 10 },
    { id: "b", sourceId: "s", lane: 0, start: 20, offset: 0, length: 10 },
  ];

  it("keeps a free position", () => {
    expect(fitStart(others, 12, 5, "nearest")).toBe(12);
    expect(fitStart([], -3, 5, "nearest")).toBe(0);
  });

  it("pushes an overlapping clip flush to the nearest neighbour", () => {
    expect(fitStart(others, 8, 5, "nearest")).toBe(10);
    expect(fitStart(others, 17, 5, "nearest")).toBe(15);
    expect(fitStart(others, 25, 5, "nearest")).toBe(30);
  });

  it("skips gaps that are too short", () => {
    expect(fitStart(others, 12, 15, "nearest")).toBe(30);
    expect(fitStart(others, 12, 15, "forward")).toBe(30);
  });

  it("forward never goes before the requested time", () => {
    expect(fitStart(others, 5, 5, "forward")).toBe(10);
    expect(fitStart(others, 16, 5, "forward")).toBe(30);
  });
});

describe("addClip", () => {
  it("clips the fragment to the source and places it from the cursor", () => {
    let p = withSources(source("s", 20));
    p = addClip(p, "a", { sourceId: "s", offset: 15, length: 10 }, 2, 4);
    expect(clip(p, "a")).toMatchObject({ lane: 2, start: 4, offset: 15, length: 5 });
  });

  it("ignores unknown sources, bad lanes and too short fragments", () => {
    const p = withSources(source("s", 20));
    expect(addClip(p, "a", { sourceId: "x", offset: 0, length: 5 }, 0, 0)).toBe(p);
    expect(addClip(p, "a", { sourceId: "s", offset: 0, length: 5 }, 3, 0)).toBe(p);
    expect(addClip(p, "a", { sourceId: "s", offset: 20, length: 5 }, 0, 0)).toBe(p);
  });

  it("does not overlap existing clips", () => {
    const p = addClip(twoClips(), "c", { sourceId: "music", offset: 0, length: 5 }, 0, 3);
    expect(clip(p, "c").start).toBe(10);
    expect(noOverlaps(p)).toBe(true);
  });
});

describe("moveClip", () => {
  it("moves in time and to another lane", () => {
    const p = moveClip(twoClips(), "a", 1, 22);
    expect(clip(p, "a")).toMatchObject({ lane: 1, start: 22 });
  });

  it("stops flush against a neighbour", () => {
    expect(clip(moveClip(twoClips(), "a", 0, 15), "a").start).toBe(10);
    expect(clip(moveClip(twoClips(), "a", 0, 24), "a").start).toBe(30);
    expect(clip(moveClip(twoClips(), "b", 0, 3), "b").start).toBe(10);
  });

  it("returns the same project when nothing changes", () => {
    const p = twoClips();
    expect(moveClip(p, "a", 0, 0)).toBe(p);
    expect(moveClip(p, "a", 0, -5)).toBe(p);
    expect(moveClip(p, "zzz", 0, 3)).toBe(p);
  });
});

describe("trimClip", () => {
  it("trims the start, moving the offset with it", () => {
    const p = trimClip(twoClips(), "b", "start", 24);
    expect(clip(p, "b")).toMatchObject({ start: 24, offset: 34, length: 6 });
  });

  it("extends the start back to the source start and the previous clip", () => {
    // b starts at 30 s into the source; the previous clip ends at 10.
    expect(clip(trimClip(twoClips(), "b", "start", 0), "b")).toMatchObject({
      start: 10,
      offset: 20,
      length: 20,
    });
    let p = withSources(source("s"));
    p = addClip(p, "x", { sourceId: "s", offset: 2, length: 5 }, 0, 10);
    expect(clip(trimClip(p, "x", "start", 0), "x")).toMatchObject({ start: 8, offset: 0 });
  });

  it("extends the end up to the source end and the next clip", () => {
    expect(clip(trimClip(twoClips(), "a", "end", 50), "a").length).toBe(20);
    expect(clip(trimClip(twoClips(), "b", "end", 100), "b").length).toBe(30);
  });

  it("keeps a minimal length", () => {
    expect(clip(trimClip(twoClips(), "a", "end", -4), "a").length).toBeCloseTo(MIN_CLIP_S);
    expect(clip(trimClip(twoClips(), "a", "start", 40), "a").length).toBeCloseTo(MIN_CLIP_S);
  });
});

describe("splitClip", () => {
  it("cuts a clip in two continuous parts", () => {
    const p = splitClip(twoClips(), "b", 24, "b2");
    expect(clip(p, "b")).toMatchObject({ start: 20, offset: 30, length: 4 });
    expect(clip(p, "b2")).toMatchObject({ start: 24, offset: 34, length: 6, lane: 0 });
  });

  it("does nothing at an edge or outside", () => {
    const p = twoClips();
    expect(splitClip(p, "b", 20, "x")).toBe(p);
    expect(splitClip(p, "b", 35, "x")).toBe(p);
  });

  it("finds the clips under the cursor", () => {
    expect(clipsAt(twoClips(), 5).map((c) => c.id)).toEqual(["a"]);
    expect(clipsAt(twoClips(), 10)).toEqual([]);
  });
});

describe("duplicate and remove", () => {
  it("puts the copy right after the original or after the next clips", () => {
    let p = duplicateClip(twoClips(), "b", "b2");
    expect(clip(p, "b2")).toMatchObject({ start: 30, offset: 30, length: 10 });
    p = duplicateClip(p, "a", "a2");
    expect(clip(p, "a2").start).toBe(10);
    p = duplicateClip(p, "a", "a3");
    expect(clip(p, "a3").start).toBe(40);
    expect(noOverlaps(p)).toBe(true);
    expect(projectDuration(p)).toBe(50);
  });

  it("removes a clip", () => {
    expect(removeClip(twoClips(), "a").clips.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("lanes", () => {
  it("clamps the volume and toggles mute", () => {
    let p = setLane(emptyProject(), 1, { volume: 1.5 });
    expect(p.lanes[1]?.volume).toBe(1);
    p = setLane(p, 1, { volume: 0.4, muted: true });
    expect(p.lanes[1]).toEqual({ volume: 0.4, muted: true });
    expect(setLane(p, 7, { muted: false })).toBe(p);
  });
});

describe("snapping", () => {
  it("snaps to the nearest target within the threshold", () => {
    expect(snapTime(9.7, [0, 10, 20], 0.5)).toBe(10);
    expect(snapTime(15, [0, 10, 20], 0.5)).toBeNull();
  });

  it("collects edges of other clips, zero and the cursor", () => {
    expect(snapTargets(twoClips(), "a", 7).sort((x, y) => x - y)).toEqual([0, 7, 20, 30]);
  });

  it("snaps either edge of a moved clip", () => {
    expect(snapClipStart(19.8, 5, [20], 0.5)).toBe(20);
    expect(snapClipStart(14.7, 5, [20], 0.5)).toBe(15);
    expect(snapClipStart(12, 5, [20], 0.5)).toBe(12);
  });
});
