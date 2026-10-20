// What to play when: shared by live playback and the offline mixdown.
import { clipEnd, type Project } from "./project";

export interface ScheduledClip {
  sourceId: string;
  lane: number;
  /** Seconds after playback starts. */
  when: number;
  /** Seconds into the source. */
  offset: number;
  duration: number;
}

/** Clips heard when playback starts at `from`; a clip under `from` starts mid-way. */
export function scheduleFrom(project: Project, from: number): ScheduledClip[] {
  const result: ScheduledClip[] = [];
  for (const c of project.clips) {
    const end = clipEnd(c);
    if (end <= from) continue;
    const skip = Math.max(0, from - c.start);
    result.push({
      sourceId: c.sourceId,
      lane: c.lane,
      when: Math.max(0, c.start - from),
      offset: c.offset + skip,
      duration: c.length - skip,
    });
  }
  return result.sort((a, b) => a.when - b.when);
}
