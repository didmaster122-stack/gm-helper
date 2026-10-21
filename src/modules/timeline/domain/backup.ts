import {
  isRecord,
  readBoolean,
  readDate,
  readInteger,
  readNullableString,
  readNumber,
  readOneOf,
  readRecords,
  readString,
  readStrings,
} from "../../../shared/parse";
import {
  EVENT_IMPORTANCES,
  EVENT_STATUSES,
  LANE_KINDS,
  MARKER_LEVELS,
  type EventLink,
  type Lane,
  type TimeMarker,
  type Timeline,
  type TimelineEvent,
} from "./types";
import { remapMentionText } from "../../../shared/mentions/domain";

/** The timeline section of a campaign backup is the stored timeline itself. */
export type TimelineBackup = Timeline;

/** Session number from 1, or null ("Future"). */
function readSession(v: unknown): number | null {
  const n = readInteger(v);
  return n !== null && n >= 1 ? n : null;
}

function parseLane(raw: Record<string, unknown>, now: string): Lane | null {
  const id = readString(raw.id);
  if (id === "") return null;
  return {
    id,
    campaignId: "",
    kind: readOneOf(LANE_KINDS, raw.kind, "custom"),
    name: readString(raw.name),
    characterId: readNullableString(raw.characterId),
    sort: readNumber(raw.sort),
    hidden: readBoolean(raw.hidden),
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function parseEvent(raw: Record<string, unknown>, now: string): TimelineEvent | null {
  const id = readString(raw.id);
  const laneId = readString(raw.laneId);
  const title = readString(raw.title).trim();
  if (id === "" || laneId === "" || title === "") return null;
  return {
    id,
    campaignId: "",
    laneId,
    session: readSession(raw.session),
    sort: readNumber(raw.sort),
    title,
    description: readString(raw.description),
    gameDate: readString(raw.gameDate),
    importance: readOneOf(EVENT_IMPORTANCES, raw.importance, "major"),
    status: readOneOf(EVENT_STATUSES, raw.status, "planned"),
    characterIds: readStrings(raw.characterIds),
    tags: readStrings(raw.tags),
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function parseLink(raw: Record<string, unknown>, now: string): EventLink | null {
  const id = readString(raw.id);
  const fromId = readString(raw.fromId);
  const toId = readString(raw.toId);
  if (id === "" || fromId === "" || toId === "") return null;
  return {
    id,
    campaignId: "",
    fromId,
    toId,
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function parseMarker(raw: Record<string, unknown>, now: string): TimeMarker | null {
  const id = readString(raw.id);
  const label = readString(raw.label).trim();
  if (id === "" || label === "") return null;
  return {
    id,
    campaignId: "",
    label,
    level: readOneOf(MARKER_LEVELS, raw.level, 1),
    session: readSession(raw.session),
    sort: readNumber(raw.sort),
    createdAt: readDate(raw.createdAt, now),
    updatedAt: readDate(raw.updatedAt, now),
  };
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

/** Reads the section leniently: damaged records are skipped, the rest is kept. */
export function parseTimelineBackup(raw: unknown, now: string): TimelineBackup {
  const section = isRecord(raw) ? raw : {};
  const sessionCount = Math.max(0, readInteger(section.sessionCount) ?? 0);
  const current = readSession(section.currentSession);
  return {
    sessionCount,
    currentSession: current !== null && current <= sessionCount ? current : null,
    lanes: readRecords(section.lanes)
      .map((r) => parseLane(r, now))
      .filter(notNull),
    events: readRecords(section.events)
      .map((r) => parseEvent(r, now))
      .filter(notNull),
    links: readRecords(section.links)
      .map((r) => parseLink(r, now))
      .filter(notNull),
    markers: readRecords(section.markers)
      .map((r) => parseMarker(r, now))
      .filter(notNull),
  };
}

/**
 * Gives every lane, event, link and marker a new id in the target campaign and fixes the
 * references: personal lanes and events point to the imported characters (`characterIds`,
 * old → new). Events of a lost lane go to the main lane; links with a lost end are dropped.
 */
export function remapTimeline(
  backup: TimelineBackup,
  campaignId: string,
  newId: () => string,
  characterIds: ReadonlyMap<string, string>,
): { timeline: Timeline; eventIds: ReadonlyMap<string, string> } {
  const laneIds = new Map(backup.lanes.map((l) => [l.id, newId()]));
  const eventIds = new Map(backup.events.map((e) => [e.id, newId()]));
  const lanes = backup.lanes.map((l) => ({
    ...l,
    id: laneIds.get(l.id) ?? newId(),
    campaignId,
    characterId: l.characterId === null ? null : (characterIds.get(l.characterId) ?? null),
  }));
  const mainLane = lanes.find((l) => l.kind === "main") ?? lanes[0];
  const events = backup.events.flatMap((e) => {
    const laneId = laneIds.get(e.laneId) ?? mainLane?.id;
    if (!laneId) return [];
    return [
      {
        ...e,
        id: eventIds.get(e.id) ?? newId(),
        campaignId,
        laneId,
        characterIds: e.characterIds.flatMap((id) => characterIds.get(id) ?? []),
      },
    ];
  });
  const links = backup.links.flatMap((l) => {
    const fromId = eventIds.get(l.fromId);
    const toId = eventIds.get(l.toId);
    return fromId && toId ? [{ ...l, id: newId(), campaignId, fromId, toId }] : [];
  });
  const markers = backup.markers.map((m) => ({ ...m, id: newId(), campaignId }));
  return {
    timeline: {
      sessionCount: backup.sessionCount,
      currentSession: backup.currentSession,
      lanes,
      events,
      links,
      markers,
    },
    eventIds,
  };
}

/** Points the mentions in the descriptions to the new ids of a restored campaign. */
export function remapTimelineMentions(
  timeline: Timeline,
  ids: ReadonlyMap<string, string>,
): Timeline {
  return {
    ...timeline,
    events: timeline.events.map((e) => ({
      ...e,
      description: remapMentionText(e.description, ids),
    })),
  };
}
