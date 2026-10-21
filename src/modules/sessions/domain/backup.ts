// The sessions section of a campaign backup: sessions with their checklists, plan notes and recaps.
import {
  isRecord,
  readBoolean,
  readDate,
  readInteger,
  readNullableString,
  readRecords,
  readString,
} from "../../../shared/parse";
import { isDay } from "../../../shared/dates";
import { remapMentionText } from "../../../shared/mentions/domain";
import { cleanRecap } from "./sessions";
import { PREP_ITEM_MAX, type Session } from "./types";

export interface SessionBackup {
  number: number;
  date: string | null;
  played: boolean;
  /** Id of the plan note in the notes section of the same file. */
  planNoteId: string | null;
  /** Mentions point to ids of the same file. */
  recap: string;
  /** Id of the recap event in the timeline section of the same file. */
  recapEventId: string | null;
  items: { text: string; done: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionsBackup {
  sessions: SessionBackup[];
}

export function toSessionsBackup(sessions: readonly Session[]): SessionsBackup {
  return {
    sessions: sessions.map((s) => ({
      number: s.number,
      date: s.date,
      played: s.played,
      planNoteId: s.planNoteId,
      recap: s.recap,
      recapEventId: s.recapEventId,
      items: s.items.map(({ text, done }) => ({ text, done })),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}

/**
 * Reads the section leniently; files from before sessions existed (versions 1–3) have none,
 * sessions written before recaps have an empty one.
 */
export function parseSessionsBackup(raw: unknown, now: string): SessionsBackup {
  if (!isRecord(raw)) return { sessions: [] };
  const seen = new Set<number>();
  const sessions = readRecords(raw.sessions).flatMap((r) => {
    const number = readInteger(r.number);
    if (number === null || number < 1 || seen.has(number)) return [];
    seen.add(number);
    const date = readNullableString(r.date);
    return [
      {
        number,
        date: date !== null && isDay(date) ? date : null,
        played: readBoolean(r.played),
        planNoteId: readNullableString(r.planNoteId),
        recap: cleanRecap(readString(r.recap)),
        recapEventId: readNullableString(r.recapEventId),
        items: readRecords(r.items)
          .map((i) => ({
            text: readString(i.text).trim().slice(0, PREP_ITEM_MAX),
            done: readBoolean(i.done),
          }))
          .filter((i) => i.text !== ""),
        createdAt: readDate(r.createdAt, now),
        updatedAt: readDate(r.updatedAt, now),
      },
    ];
  });
  return { sessions };
}

/** New ids of the other sections of the same file. */
export interface SessionLinks {
  notes: ReadonlyMap<string, string>;
  events: ReadonlyMap<string, string>;
  /** Every object that can be mentioned. */
  mentions: ReadonlyMap<string, string>;
}

/** Records for a new campaign; plan notes, recap events and mentions follow the new ids. */
export function remapSessions(
  backup: SessionsBackup,
  campaignId: string,
  newId: () => string,
  links: SessionLinks,
): Session[] {
  return backup.sessions.map((s) => ({
    id: newId(),
    campaignId,
    number: s.number,
    date: s.date,
    played: s.played,
    planNoteId: s.planNoteId ? (links.notes.get(s.planNoteId) ?? null) : null,
    recap: remapMentionText(s.recap, links.mentions),
    recapEventId: s.recapEventId ? (links.events.get(s.recapEventId) ?? null) : null,
    items: s.items.map((i) => ({ id: newId(), text: i.text, done: i.done })),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}
