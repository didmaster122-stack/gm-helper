// The notes section of a campaign backup. Attachment files are not inside: they are files of the
// library (like arts), so notes keep their relative paths.
import {
  isRecord,
  readDate,
  readNullableString,
  readOneOf,
  readRecords,
  readString,
  readStrings,
} from "../../../shared/parse";
import { docPlainText, parseDoc } from "./doc";
import { NOTE_KINDS, type Note, type NoteKind, type NoteTag } from "./types";

export interface NoteTagBackup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteBackup {
  id: string;
  kind: NoteKind;
  title: string;
  content: string;
  filePath: string | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NotesBackup {
  tags: NoteTagBackup[];
  notes: NoteBackup[];
}

export const emptyNotesBackup: NotesBackup = { tags: [], notes: [] };

export function toNotesBackup(notes: readonly Note[], tags: readonly NoteTag[]): NotesBackup {
  return {
    tags: tags.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })),
    notes: notes.map(({ id, kind, title, content, filePath, tagIds, createdAt, updatedAt }) => ({
      id,
      kind,
      title,
      content,
      filePath,
      tagIds,
      createdAt,
      updatedAt,
    })),
  };
}

/** Reads the section leniently; files from before notes existed (version 1 and 2) have none. */
export function parseNotesBackup(raw: unknown, now: string): NotesBackup {
  if (!isRecord(raw)) return emptyNotesBackup;
  const tags = readRecords(raw.tags)
    .map((t) => ({
      id: readString(t.id),
      name: readString(t.name).trim(),
      createdAt: readDate(t.createdAt, now),
      updatedAt: readDate(t.updatedAt, now),
    }))
    .filter((t) => t.id !== "" && t.name !== "");
  const notes = readRecords(raw.notes)
    .map((n) => ({
      id: readString(n.id),
      kind: readOneOf(NOTE_KINDS, n.kind, "text"),
      title: readString(n.title).trim(),
      content: readString(n.content),
      filePath: readNullableString(n.filePath),
      tagIds: readStrings(n.tagIds),
      createdAt: readDate(n.createdAt, now),
      updatedAt: readDate(n.updatedAt, now),
    }))
    .filter((n) => n.id !== "" && (n.kind === "text" || n.filePath !== null));
  return { tags, notes };
}

/** Records for a new campaign: new ids, tag links only to tags of the section. */
export function remapNotes(
  backup: NotesBackup,
  campaignId: string,
  newId: () => string,
  untitled: string,
): { tags: NoteTag[]; notes: Note[] } {
  const tagIds = new Map(backup.tags.map((t) => [t.id, newId()]));
  const tags = backup.tags.map((t) => ({
    id: tagIds.get(t.id) ?? newId(),
    campaignId,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
  const notes = backup.notes.map((n) => ({
    id: newId(),
    campaignId,
    kind: n.kind,
    title: n.title || untitled,
    content: n.kind === "text" ? n.content : "",
    plainText: n.kind === "text" ? docPlainText(parseDoc(n.content)) : "",
    filePath: n.kind === "pdf" ? n.filePath : null,
    tagIds: [...new Set(n.tagIds.map((id) => tagIds.get(id)).filter((id) => id !== undefined))],
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));
  return { tags, notes };
}
