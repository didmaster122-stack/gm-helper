/** "main" always exists; "personal" lanes are created for player characters. */
export type LaneKind = "main" | "personal" | "custom";
export type EventImportance = "major" | "minor";
export type EventStatus = "planned" | "happened" | "failed" | "cancelled";

export const LANE_KINDS: readonly LaneKind[] = ["main", "personal", "custom"];
export const EVENT_IMPORTANCES: readonly EventImportance[] = ["major", "minor"];
export const EVENT_STATUSES: readonly EventStatus[] = [
  "planned",
  "happened",
  "failed",
  "cancelled",
];

/** Horizontal band of the timeline (spec §5.1). */
export interface Lane {
  id: string;
  campaignId: string;
  kind: LaneKind;
  /** Name of a custom lane; for a personal lane, the character name when the lane was made. */
  name: string;
  /** Player character of a personal lane. */
  characterId: string | null;
  sort: number;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Marker detail: 1 — eras and years (always shown), 2 — months, 3 — days (when zoomed in). */
export type MarkerLevel = 1 | 2 | 3;
export const MARKER_LEVELS: readonly MarkerLevel[] = [1, 2, 3];

export interface TimelineEvent {
  id: string;
  campaignId: string;
  laneId: string;
  /** Session number from 1; null means "Future" (planned, no session yet). */
  session: number | null;
  /** Order inside the session, shared by all lanes and the time markers. */
  sort: number;
  title: string;
  description: string;
  /** In-game date as free text; shown, but does not set the order. */
  gameDate: string;
  importance: EventImportance;
  status: EventStatus;
  characterIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Arrow "cause → consequence". */
export interface EventLink {
  id: string;
  campaignId: string;
  fromId: string;
  toId: string;
  createdAt: string;
  updatedAt: string;
}

/** In-game time mark on the right of the timeline ("Winter 1492", "3rd day of Harvest"). */
export interface TimeMarker {
  id: string;
  campaignId: string;
  label: string;
  level: MarkerLevel;
  /** Session the marker is in (null — "Future"); it stands before the next item of the session. */
  session: number | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

/** Everything the timeline of one campaign stores. Immutable: edits make new objects. */
export interface Timeline {
  /** Sessions are numbered 1..sessionCount. */
  sessionCount: number;
  currentSession: number | null;
  lanes: readonly Lane[];
  events: readonly TimelineEvent[];
  links: readonly EventLink[];
  markers: readonly TimeMarker[];
}

export const emptyTimeline: Timeline = {
  sessionCount: 0,
  currentSession: null,
  lanes: [],
  events: [],
  links: [],
  markers: [],
};

/** What the timeline needs to know about a character of the campaign. */
export interface CharacterRef {
  id: string;
  name: string;
  isPc: boolean;
}
