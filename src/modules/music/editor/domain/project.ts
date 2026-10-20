// Music editor project (spec §6.4): up to three sources, three lanes and clips on them.
// Times are in seconds. Every operation returns a new project and keeps the rule
// "clips on one lane never overlap".

export const LANE_COUNT = 3;
export const MAX_SOURCES = 3;
/** Shortest clip a trim or split may leave. */
export const MIN_CLIP_S = 0.05;
const EPS = 1e-6;

export interface EditorSource {
  id: string;
  trackId: string;
  title: string;
  /** Relative to the music folder, as in the catalog. */
  relPath: string;
  /** Seconds, from the decoded audio. */
  duration: number;
}

export interface Clip {
  id: string;
  sourceId: string;
  /** 0 … LANE_COUNT-1. */
  lane: number;
  /** Position on the timeline. */
  start: number;
  /** Where the clip begins inside its source. */
  offset: number;
  length: number;
}

export interface Lane {
  /** 0 … 1. */
  volume: number;
  muted: boolean;
}

export interface Project {
  sources: EditorSource[];
  lanes: Lane[];
  clips: Clip[];
}

/** The part of a clip that the clipboard keeps. */
export type ClipContent = Pick<Clip, "sourceId" | "offset" | "length">;

export function emptyProject(): Project {
  return {
    sources: [],
    lanes: Array.from({ length: LANE_COUNT }, () => ({ volume: 1, muted: false })),
    clips: [],
  };
}

export const clipEnd = (clip: Pick<Clip, "start" | "length">): number => clip.start + clip.length;

export function projectDuration(project: Project): number {
  return project.clips.reduce((end, c) => Math.max(end, clipEnd(c)), 0);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function laneClips(project: Project, lane: number, exceptId?: string): Clip[] {
  return project.clips
    .filter((c) => c.lane === lane && c.id !== exceptId)
    .sort((a, b) => a.start - b.start);
}

/** Free intervals between clips, the last one open-ended. `others` must be sorted. */
function freeGaps(others: readonly Clip[]): { from: number; to: number }[] {
  const gaps: { from: number; to: number }[] = [];
  let from = 0;
  for (const c of others) {
    if (c.start > from + EPS) gaps.push({ from, to: c.start });
    from = Math.max(from, clipEnd(c));
  }
  gaps.push({ from, to: Infinity });
  return gaps;
}

/**
 * Where a clip of `length` lands when asked to start at `start` among `others`:
 * "nearest" moves it the least (it stops flush against a neighbour), "forward" takes
 * the first free place at or after `start`.
 */
export function fitStart(
  others: readonly Clip[],
  start: number,
  length: number,
  mode: "nearest" | "forward",
): number {
  const sorted = [...others].sort((a, b) => a.start - b.start);
  const wanted = Math.max(0, start);
  let best = wanted;
  let bestDistance = Infinity;
  for (const gap of freeGaps(sorted)) {
    const latest = gap.to - length;
    if (latest < gap.from - EPS) continue;
    if (mode === "forward") {
      if (latest < wanted - EPS) continue;
      return Math.max(wanted, gap.from);
    }
    const candidate = clamp(wanted, gap.from, latest);
    const distance = Math.abs(candidate - wanted);
    if (distance < bestDistance - EPS) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function sourceOf(project: Project, sourceId: string): EditorSource | undefined {
  return project.sources.find((s) => s.id === sourceId);
}

function replaceClip(project: Project, clip: Clip): Project {
  return { ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) };
}

function findClip(project: Project, id: string): Clip | undefined {
  return project.clips.find((c) => c.id === id);
}

const validLane = (lane: number) => Number.isInteger(lane) && lane >= 0 && lane < LANE_COUNT;

// ---- Sources ----

/** Adds a source unless there are already three or the track is already in. */
export function addSource(project: Project, source: EditorSource): Project {
  if (project.sources.length >= MAX_SOURCES) return project;
  if (project.sources.some((s) => s.trackId === source.trackId)) return project;
  return { ...project, sources: [...project.sources, source] };
}

/** Removes the source and every clip made from it. */
export function removeSource(project: Project, sourceId: string): Project {
  return {
    ...project,
    sources: project.sources.filter((s) => s.id !== sourceId),
    clips: project.clips.filter((c) => c.sourceId !== sourceId),
  };
}

// ---- Clips ----

/**
 * Puts a fragment of a source on a lane at the first free place from `at`.
 * The fragment is clipped to the source; a too short one is ignored.
 */
export function addClip(
  project: Project,
  id: string,
  content: ClipContent,
  lane: number,
  at: number,
): Project {
  const source = sourceOf(project, content.sourceId);
  if (!source || !validLane(lane)) return project;
  const offset = clamp(content.offset, 0, source.duration);
  const length = Math.min(content.length, source.duration - offset);
  if (length < MIN_CLIP_S - EPS) return project;
  const start = fitStart(laneClips(project, lane), at, length, "forward");
  const clip: Clip = { id, sourceId: source.id, lane, start, offset, length };
  return { ...project, clips: [...project.clips, clip] };
}

/** Moves a clip in time and/or to another lane; it stops flush against a neighbour. */
export function moveClip(project: Project, id: string, lane: number, start: number): Project {
  const clip = findClip(project, id);
  if (!clip || !validLane(lane)) return project;
  const placed = fitStart(laneClips(project, lane, id), start, clip.length, "nearest");
  if (placed === clip.start && lane === clip.lane) return project;
  return replaceClip(project, { ...clip, lane, start: placed });
}

/**
 * Drags one edge of a clip to `time`. The edge cannot pass the neighbour, the
 * source's own start or end, or leave less than MIN_CLIP_S.
 */
export function trimClip(
  project: Project,
  id: string,
  edge: "start" | "end",
  time: number,
): Project {
  const clip = findClip(project, id);
  const source = clip && sourceOf(project, clip.sourceId);
  if (!clip || !source) return project;
  const others = laneClips(project, clip.lane, id);
  const end = clipEnd(clip);

  if (edge === "start") {
    const prevEnd = others.reduce(
      (acc, c) => (clipEnd(c) <= clip.start + EPS ? Math.max(acc, clipEnd(c)) : acc),
      0,
    );
    const min = Math.max(prevEnd, clip.start - clip.offset, 0);
    const start = clamp(time, min, end - MIN_CLIP_S);
    if (Math.abs(start - clip.start) < EPS) return project;
    return replaceClip(project, {
      ...clip,
      start,
      offset: clip.offset + (start - clip.start),
      length: end - start,
    });
  }

  const nextStart = others.reduce(
    (acc, c) => (c.start >= end - EPS ? Math.min(acc, c.start) : acc),
    Infinity,
  );
  const max = Math.min(nextStart, clip.start + source.duration - clip.offset);
  const newEnd = clamp(time, clip.start + MIN_CLIP_S, max);
  if (Math.abs(newEnd - end) < EPS) return project;
  return replaceClip(project, { ...clip, length: newEnd - clip.start });
}

/** Cuts a clip in two at `time`; the right part gets `newId`. */
export function splitClip(project: Project, id: string, time: number, newId: string): Project {
  const clip = findClip(project, id);
  if (!clip) return project;
  const end = clipEnd(clip);
  if (time < clip.start + MIN_CLIP_S - EPS || time > end - MIN_CLIP_S + EPS) return project;
  const left: Clip = { ...clip, length: time - clip.start };
  const right: Clip = {
    ...clip,
    id: newId,
    start: time,
    offset: clip.offset + (time - clip.start),
    length: end - time,
  };
  const split = replaceClip(project, left);
  return { ...split, clips: [...split.clips, right] };
}

/** Copy right after the original (or the first free place after it). */
export function duplicateClip(project: Project, id: string, newId: string): Project {
  const clip = findClip(project, id);
  if (!clip) return project;
  return addClip(project, newId, clip, clip.lane, clipEnd(clip));
}

export function removeClip(project: Project, id: string): Project {
  if (!findClip(project, id)) return project;
  return { ...project, clips: project.clips.filter((c) => c.id !== id) };
}

/** Clips under `time` (strictly inside, so a cut at an edge does nothing). */
export function clipsAt(project: Project, time: number): Clip[] {
  return project.clips.filter(
    (c) => time > c.start + MIN_CLIP_S - EPS && time < clipEnd(c) - MIN_CLIP_S + EPS,
  );
}

// ---- Lanes ----

export function setLane(project: Project, index: number, patch: Partial<Lane>): Project {
  const lane = project.lanes[index];
  if (!lane) return project;
  const next: Lane = {
    volume: clamp(patch.volume ?? lane.volume, 0, 1),
    muted: patch.muted ?? lane.muted,
  };
  if (next.volume === lane.volume && next.muted === lane.muted) return project;
  return { ...project, lanes: project.lanes.map((l, i) => (i === index ? next : l)) };
}

export const laneGain = (lane: Lane | undefined): number => (!lane || lane.muted ? 0 : lane.volume);

// ---- Snapping ----

/** Times a dragged edge sticks to: the start, the cursor and the edges of other clips. */
export function snapTargets(project: Project, exceptId: string | null, cursor: number): number[] {
  const targets = [0, cursor];
  for (const c of project.clips) {
    if (c.id === exceptId) continue;
    targets.push(c.start, clipEnd(c));
  }
  return targets;
}

/** The nearest target within `threshold`, or null. */
export function snapTime(
  time: number,
  targets: readonly number[],
  threshold: number,
): number | null {
  let best: number | null = null;
  for (const t of targets) {
    const d = Math.abs(t - time);
    if (d <= threshold && (best === null || d < Math.abs(best - time))) best = t;
  }
  return best;
}

/** Start for a moved clip, with either of its edges snapped to the nearest target. */
export function snapClipStart(
  start: number,
  length: number,
  targets: readonly number[],
  threshold: number,
): number {
  const byStart = snapTime(start, targets, threshold);
  const byEnd = snapTime(start + length, targets, threshold);
  const dStart = byStart === null ? Infinity : Math.abs(byStart - start);
  const dEnd = byEnd === null ? Infinity : Math.abs(byEnd - (start + length));
  if (byStart !== null && dStart <= dEnd) return byStart;
  if (byEnd !== null) return byEnd - length;
  return start;
}
