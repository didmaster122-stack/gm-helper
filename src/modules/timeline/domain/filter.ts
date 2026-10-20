import type { EventStatus, Timeline, TimelineEvent } from "./types";

export interface TimelineFilter {
  /** Show only this lane. */
  laneId: string | null;
  /** Statuses to show; null shows all. */
  statuses: ReadonlySet<EventStatus> | null;
  characterId: string | null;
  tag: string | null;
  /** "What has happened": hides everything planned. */
  happenedOnly: boolean;
}

export const noFilter: TimelineFilter = {
  laneId: null,
  statuses: null,
  characterId: null,
  tag: null,
  happenedOnly: false,
};

/** Number of active filters (the "what has happened" switch is shown on its own). */
export function activeFilters(f: TimelineFilter): number {
  return (
    Number(f.laneId !== null) +
    Number(f.statuses !== null) +
    Number(f.characterId !== null) +
    Number(f.tag !== null)
  );
}

export function isFiltered(f: TimelineFilter): boolean {
  return activeFilters(f) > 0 || f.happenedOnly;
}

export function eventVisible(e: TimelineEvent, f: TimelineFilter): boolean {
  if (f.laneId !== null && e.laneId !== f.laneId) return false;
  if (f.statuses !== null && !f.statuses.has(e.status)) return false;
  if (f.happenedOnly && e.status === "planned") return false;
  if (f.characterId !== null && !e.characterIds.includes(f.characterId)) return false;
  if (f.tag !== null && !e.tags.includes(f.tag)) return false;
  return true;
}

export function visibleEvents(t: Timeline, f: TimelineFilter): TimelineEvent[] {
  return t.events.filter((e) => eventVisible(e, f));
}

/** All tags of the timeline's events, sorted. */
export function allTags(t: Timeline): string[] {
  return [...new Set(t.events.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, "ru"));
}
