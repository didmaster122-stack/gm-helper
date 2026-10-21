export const NOTE_KINDS = ["text", "pdf"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface NoteTag {
  id: string;
  campaignId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  campaignId: string;
  kind: NoteKind;
  title: string;
  /** Serialized editor document of a text note (see `doc.ts`); empty for a PDF. */
  content: string;
  /** Text of the document, for search. */
  plainText: string;
  /** PDF file relative to the library root (PDF notes only). */
  filePath: string | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const NOTE_TITLE_MAX = 200;
export const NOTE_TAG_MAX = 60;
