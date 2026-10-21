// Sessions of one campaign: which one is next, what "played" does, numbering.
import {
  PREP_ITEM_MAX,
  type CampaignStatus,
  type ChangeSource,
  type PrepItem,
  type Session,
} from "./types";

/** What a change does to the list: sessions to write and ids to delete. */
export interface SessionChange {
  put: Session[];
  remove: string[];
}

const noChange: SessionChange = { put: [], remove: [] };

export function sortSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => a.number - b.number);
}

/** The next session is the first one not played yet. */
export function nextSession(sessions: readonly Session[]): Session | null {
  return sortSessions(sessions).find((s) => !s.played) ?? null;
}

/** The played session with the highest number. */
export function lastPlayed(sessions: readonly Session[]): Session | null {
  return (
    sortSessions(sessions)
      .filter((s) => s.played)
      .at(-1) ?? null
  );
}

export function nextNumber(sessions: readonly Session[]): number {
  return Math.max(0, ...sessions.map((s) => s.number)) + 1;
}

export function campaignStatus(archived: boolean, sessions: readonly Session[]): CampaignStatus {
  if (archived) return "finished";
  return sessions.some((s) => s.played) ? "running" : "prep";
}

export function newSession(
  campaignId: string,
  number: number,
  src: ChangeSource,
  date: string | null = null,
): Session {
  return {
    id: src.newId(),
    campaignId,
    number,
    date,
    played: false,
    planNoteId: null,
    items: [],
    createdAt: src.now,
    updatedAt: src.now,
  };
}

/** Nothing was set on it yet: it can go away without losing anything. */
function isUntouched(session: Session): boolean {
  return session.date === null && session.planNoteId === null && session.items.length === 0;
}

/**
 * Marks the session played (today, if it has no date) and makes sure an unplayed one follows:
 * a new session with the next number is created when there is none.
 */
export function markPlayed(
  sessions: readonly Session[],
  id: string,
  today: string,
  src: ChangeSource,
): SessionChange {
  const session = sessions.find((s) => s.id === id);
  if (!session || session.played) return noChange;
  const played: Session = {
    ...session,
    played: true,
    date: session.date ?? today,
    updatedAt: src.now,
  };
  const rest = sessions.map((s) => (s.id === id ? played : s));
  const put = [played];
  if (!rest.some((s) => !s.played)) put.push(newSession(session.campaignId, nextNumber(rest), src));
  return { put, remove: [] };
}

/**
 * Takes the mark back. The session that "played" created for the next number goes away again
 * if it is still the last one and nothing was set on it.
 */
export function unmarkPlayed(
  sessions: readonly Session[],
  id: string,
  src: ChangeSource,
): SessionChange {
  const session = sessions.find((s) => s.id === id);
  if (!session || !session.played) return noChange;
  const following = sortSessions(sessions).at(-1);
  const remove =
    following &&
    following.number === session.number + 1 &&
    !following.played &&
    isUntouched(following)
      ? [following.id]
      : [];
  return { put: [{ ...session, played: false, updatedAt: src.now }], remove };
}

export type NumberError = "invalid" | "taken";

export function numberError(
  sessions: readonly Session[],
  id: string,
  number: number,
): NumberError | null {
  if (!Number.isInteger(number) || number < 1) return "invalid";
  if (sessions.some((s) => s.id !== id && s.number === number)) return "taken";
  return null;
}

export function update(
  session: Session,
  change: Partial<Pick<Session, "number" | "date" | "planNoteId" | "items">>,
  src: Pick<ChangeSource, "now">,
): Session {
  return { ...session, ...change, updatedAt: src.now };
}

// Checklist

export function prepProgress(items: readonly PrepItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

const clip = (text: string) => text.trim().slice(0, PREP_ITEM_MAX).trim();

export function addItem(items: readonly PrepItem[], text: string, newId: () => string): PrepItem[] {
  const value = clip(text);
  return value === "" ? [...items] : [...items, { id: newId(), text: value, done: false }];
}

export function toggleItem(items: readonly PrepItem[], id: string): PrepItem[] {
  return items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

/** An empty text keeps the old one. */
export function renameItem(items: readonly PrepItem[], id: string, text: string): PrepItem[] {
  const value = clip(text);
  return items.map((i) => (i.id === id && value !== "" ? { ...i, text: value } : i));
}

export function removeItem(items: readonly PrepItem[], id: string): PrepItem[] {
  return items.filter((i) => i.id !== id);
}

/** Moves the item one place up (-1) or down (1). */
export function moveItem(items: readonly PrepItem[], id: string, delta: -1 | 1): PrepItem[] {
  const from = items.findIndex((i) => i.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
}
