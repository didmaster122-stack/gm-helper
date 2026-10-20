import { runScript, sqlLiteral } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
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
} from "./domain/types";

function parseStrings(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((v) => v === value) ?? fallback;
}

interface TimelineRow {
  session_count: number;
  current_session: number | null;
}

interface LaneRow {
  id: string;
  campaign_id: string;
  kind: string;
  name: string;
  character_id: string | null;
  sort: number;
  hidden: number;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  campaign_id: string;
  lane_id: string;
  session: number | null;
  sort: number;
  title: string;
  description: string;
  game_date: string;
  importance: string;
  status: string;
  characters: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

interface LinkRow {
  id: string;
  campaign_id: string;
  from_id: string;
  to_id: string;
  created_at: string;
  updated_at: string;
}

interface MarkerRow {
  id: string;
  campaign_id: string;
  label: string;
  level: number;
  session: number | null;
  sort: number;
  created_at: string;
  updated_at: string;
}

function markerFromRow(row: MarkerRow): TimeMarker {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    label: row.label,
    level: MARKER_LEVELS.find((l) => l === row.level) ?? 1,
    session: row.session,
    sort: row.sort,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function laneFromRow(row: LaneRow): Lane {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: oneOf(LANE_KINDS, row.kind, "custom"),
    name: row.name,
    characterId: row.character_id,
    sort: row.sort,
    hidden: row.hidden !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventFromRow(row: EventRow): TimelineEvent {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    laneId: row.lane_id,
    session: row.session,
    sort: row.sort,
    title: row.title,
    description: row.description,
    gameDate: row.game_date,
    importance: oneOf(EVENT_IMPORTANCES, row.importance, "major"),
    status: oneOf(EVENT_STATUSES, row.status, "planned"),
    characterIds: parseStrings(row.characters),
    tags: parseStrings(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function linkFromRow(row: LinkRow): EventLink {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    fromId: row.from_id,
    toId: row.to_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The stored timeline; a campaign that never opened it has no lanes and no sessions. */
export async function loadTimeline(db: Db, campaignId: string): Promise<Timeline> {
  const [settings, lanes, events, links, markers] = await Promise.all([
    db.select<TimelineRow>("SELECT * FROM timelines WHERE campaign_id = ?", [campaignId]),
    db.select<LaneRow>("SELECT * FROM timeline_lanes WHERE campaign_id = ? ORDER BY sort", [
      campaignId,
    ]),
    db.select<EventRow>(
      "SELECT * FROM timeline_events WHERE campaign_id = ? ORDER BY created_at, id",
      [campaignId],
    ),
    db.select<LinkRow>(
      "SELECT * FROM timeline_links WHERE campaign_id = ? ORDER BY created_at, id",
      [campaignId],
    ),
    db.select<MarkerRow>(
      "SELECT * FROM timeline_markers WHERE campaign_id = ? ORDER BY created_at, id",
      [campaignId],
    ),
  ]);
  return {
    sessionCount: settings[0]?.session_count ?? 0,
    currentSession: settings[0]?.current_session ?? null,
    lanes: lanes.map(laneFromRow),
    events: events.map(eventFromRow),
    links: links.map(linkFromRow),
    markers: markers.map(markerFromRow),
  };
}

const L = sqlLiteral;

function upsertLane(l: Lane): string {
  return `INSERT OR REPLACE INTO timeline_lanes (id, campaign_id, kind, name, character_id, sort,
    hidden, created_at, updated_at)
    VALUES (${[
      L(l.id),
      L(l.campaignId),
      L(l.kind),
      L(l.name),
      L(l.characterId),
      L(l.sort),
      L(l.hidden),
      L(l.createdAt),
      L(l.updatedAt),
    ].join(", ")})`;
}

function upsertEvent(e: TimelineEvent): string {
  return `INSERT OR REPLACE INTO timeline_events (id, campaign_id, lane_id, session, sort, title,
    description, game_date, importance, status, characters, tags, created_at, updated_at)
    VALUES (${[
      L(e.id),
      L(e.campaignId),
      L(e.laneId),
      L(e.session),
      L(e.sort),
      L(e.title),
      L(e.description),
      L(e.gameDate),
      L(e.importance),
      L(e.status),
      L(JSON.stringify(e.characterIds)),
      L(JSON.stringify(e.tags)),
      L(e.createdAt),
      L(e.updatedAt),
    ].join(", ")})`;
}

function upsertLink(l: EventLink): string {
  return `INSERT OR REPLACE INTO timeline_links (id, campaign_id, from_id, to_id, created_at,
    updated_at)
    VALUES (${[L(l.id), L(l.campaignId), L(l.fromId), L(l.toId), L(l.createdAt), L(l.updatedAt)].join(", ")})`;
}

function upsertMarker(m: TimeMarker): string {
  return `INSERT OR REPLACE INTO timeline_markers (id, campaign_id, label, level, session, sort,
    created_at, updated_at)
    VALUES (${[
      L(m.id),
      L(m.campaignId),
      L(m.label),
      L(m.level),
      L(m.session),
      L(m.sort),
      L(m.createdAt),
      L(m.updatedAt),
    ].join(", ")})`;
}

function diffList<T extends { id: string }>(
  table: string,
  prev: readonly T[],
  next: readonly T[],
  upsert: (item: T) => string,
): string[] {
  const before = new Map(prev.map((item) => [item.id, item]));
  const after = new Set(next.map((item) => item.id));
  const statements: string[] = [];
  for (const item of prev) {
    if (!after.has(item.id)) statements.push(`DELETE FROM ${table} WHERE id = ${L(item.id)}`);
  }
  // Timeline edits keep unchanged entities by reference.
  for (const item of next) if (before.get(item.id) !== item) statements.push(upsert(item));
  return statements;
}

/** SQL that turns the stored timeline `prev` of a campaign into `next`. */
export function timelineDiffStatements(
  campaignId: string,
  prev: Timeline,
  next: Timeline,
): string[] {
  const statements: string[] = [];
  if (prev.sessionCount !== next.sessionCount || prev.currentSession !== next.currentSession) {
    statements.push(
      `INSERT OR REPLACE INTO timelines (campaign_id, session_count, current_session)
       VALUES (${L(campaignId)}, ${L(next.sessionCount)}, ${L(next.currentSession)})`,
    );
  }
  return [
    ...statements,
    ...diffList("timeline_lanes", prev.lanes, next.lanes, upsertLane),
    ...diffList("timeline_events", prev.events, next.events, upsertEvent),
    ...diffList("timeline_links", prev.links, next.links, upsertLink),
    ...diffList("timeline_markers", prev.markers, next.markers, upsertMarker),
  ];
}

/** Saves the change from `prev` to `next` atomically. */
export async function saveTimelineChange(
  db: Db,
  campaignId: string,
  prev: Timeline,
  next: Timeline,
): Promise<void> {
  const statements = timelineDiffStatements(campaignId, prev, next);
  if (statements.length > 0) await runScript(db, statements);
}
