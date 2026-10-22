export interface PrepItem {
  id: string;
  text: string;
  done: boolean;
}

/** A game session of a campaign. */
export interface Session {
  id: string;
  campaignId: string;
  /** 1, 2, 3… unique within the campaign. */
  number: number;
  /** Calendar day "YYYY-MM-DD" (local), or null when not scheduled yet. */
  date: string | null;
  played: boolean;
  /** The note with the session plan; it may have been deleted since. */
  planNoteId: string | null;
  /** What happened at the table: text with mention tokens (see `formatMention`), "" when none. */
  recap: string;
  /** The timeline event that repeats the recap; it may have been deleted since. */
  recapEventId: string | null;
  /** The preparation checklist, in the order the user set. */
  items: PrepItem[];
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = "prep" | "running" | "finished";

export const PREP_ITEM_MAX = 300;
export const RECAP_MAX = 20_000;

/** Time and ids for changes, so the logic stays testable. */
export interface ChangeSource {
  now: string;
  newId: () => string;
}
