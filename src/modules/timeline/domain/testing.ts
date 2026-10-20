// Test fixtures for the timeline. Never import from app code.
import type { EventLink, Lane, TimeMarker, Timeline, TimelineEvent } from "./types";

const T = "2026-10-20T12:00:00.000Z";

export function lane(id: string, patch: Partial<Lane> = {}): Lane {
  return {
    id,
    campaignId: "camp",
    kind: "custom",
    name: id,
    characterId: null,
    sort: 0,
    hidden: false,
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}

export function event(id: string, patch: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id,
    campaignId: "camp",
    laneId: "main",
    session: 1,
    sort: 0,
    title: id,
    description: "",
    gameDate: "",
    importance: "major",
    status: "planned",
    characterIds: [],
    tags: [],
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}

export function link(id: string, fromId: string, toId: string): EventLink {
  return { id, campaignId: "camp", fromId, toId, createdAt: T, updatedAt: T };
}

export function marker(id: string, patch: Partial<TimeMarker> = {}): TimeMarker {
  return {
    id,
    campaignId: "camp",
    label: id,
    level: 1,
    session: 1,
    sort: 0,
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}

export function timeline(patch: Partial<Timeline> = {}): Timeline {
  return {
    sessionCount: 3,
    currentSession: 1,
    lanes: [lane("main", { kind: "main", name: "", sort: 0 }), lane("side", { sort: 1 })],
    events: [],
    links: [],
    markers: [],
    ...patch,
  };
}

export function idSource(): { campaignId: string; now: string; newId: () => string } {
  let n = 0;
  return { campaignId: "camp", now: T, newId: () => `id${++n}` };
}
