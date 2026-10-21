// The sessions section of a campaign backup: sessions with their checklists and plan notes.
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
import { PREP_ITEM_MAX, type Session } from "./types";

export interface SessionBackup {
  number: number;
  date: string | null;
  played: boolean;
  /** Id of the plan note in the notes section of the same file. */
  planNoteId: string | null;
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
      items: s.items.map(({ text, done }) => ({ text, done })),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}

/** Reads the section leniently; files from before sessions existed (versions 1–3) have none. */
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

/** Records for a new campaign; plan notes are linked through the new ids of the notes. */
export function remapSessions(
  backup: SessionsBackup,
  campaignId: string,
  newId: () => string,
  noteIds: ReadonlyMap<string, string>,
): Session[] {
  return backup.sessions.map((s) => ({
    id: newId(),
    campaignId,
    number: s.number,
    date: s.date,
    played: s.played,
    planNoteId: s.planNoteId ? (noteIds.get(s.planNoteId) ?? null) : null,
    items: s.items.map((i) => ({ id: newId(), text: i.text, done: i.done })),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}
