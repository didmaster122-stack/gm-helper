import { runScript, sqlLiteral } from "../../shared/db/script";
import { placeholders } from "../../shared/db/placeholders";
import type { Db } from "../../shared/db/types";
import type { MentionTarget } from "../../shared/mentions/domain";
import type { SearchRecord } from "../../shared/search/global";
import { docMentions, parseDoc } from "./domain/doc";
import { NOTE_KINDS, type Note, type NoteKind, type NoteTag } from "./domain/types";

export interface RepoClock {
  now: () => Date;
  newId: () => string;
}

const defaultClock: RepoClock = {
  now: () => new Date(),
  newId: () => crypto.randomUUID(),
};

interface NoteRow {
  id: string;
  campaign_id: string;
  kind: string;
  title: string;
  content: string;
  plain_text: string;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: string;
  campaign_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function noteFromRow(row: NoteRow, tagIds: string[]): Note {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: NOTE_KINDS.find((k) => k === row.kind) ?? "text",
    title: row.title,
    content: row.content,
    plainText: row.plain_text,
    filePath: row.file_path,
    tagIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tagFromRow(row: TagRow): NoteTag {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listNotes(db: Db, campaignId: string): Promise<Note[]> {
  const [rows, links] = await Promise.all([
    db.select<NoteRow>("SELECT * FROM notes WHERE campaign_id = ?", [campaignId]),
    db.select<{ note_id: string; tag_id: string }>(
      `SELECT l.note_id, l.tag_id FROM note_tag_links l
       JOIN notes n ON n.id = l.note_id WHERE n.campaign_id = ?`,
      [campaignId],
    ),
  ]);
  const tagsByNote = new Map<string, string[]>();
  for (const link of links) {
    const list = tagsByNote.get(link.note_id);
    if (list) list.push(link.tag_id);
    else tagsByNote.set(link.note_id, [link.tag_id]);
  }
  return rows.map((r) => noteFromRow(r, tagsByNote.get(r.id) ?? []));
}

/** What every note of every campaign refers to, to tell which attachment files are unused. */
export function listNoteFileRefs(
  db: Db,
): Promise<{ kind: NoteKind; content: string; filePath: string | null }[]> {
  return db.select<{ kind: NoteKind; content: string; filePath: string | null }>(
    "SELECT kind, content, file_path AS filePath FROM notes",
  );
}

export async function listTags(db: Db, campaignId: string): Promise<NoteTag[]> {
  const rows = await db.select<TagRow>("SELECT * FROM note_tags WHERE campaign_id = ?", [
    campaignId,
  ]);
  return rows.map(tagFromRow);
}

export interface NoteInput {
  campaignId: string;
  kind: NoteKind;
  title: string;
  content: string;
  plainText: string;
  filePath: string | null;
  tagIds: string[];
}

/** Insert statements of a note with its tag links (for scripts: new notes, backups). */
export function noteInsertStatements(note: Note): string[] {
  const values = [
    note.id,
    note.campaignId,
    note.kind,
    note.title,
    note.content,
    note.plainText,
    note.filePath,
    note.createdAt,
    note.updatedAt,
  ].map(sqlLiteral);
  return [
    `INSERT INTO notes (id, campaign_id, kind, title, content, plain_text, file_path, created_at, updated_at)
      VALUES (${values.join(", ")})`,
    ...note.tagIds.map(
      (tagId) =>
        `INSERT OR IGNORE INTO note_tag_links (note_id, tag_id) VALUES (${sqlLiteral(note.id)}, ${sqlLiteral(tagId)})`,
    ),
  ];
}

export function tagInsertStatement(tag: NoteTag): string {
  const values = [tag.id, tag.campaignId, tag.name, tag.createdAt, tag.updatedAt].map(sqlLiteral);
  return `INSERT INTO note_tags (id, campaign_id, name, created_at, updated_at)
    VALUES (${values.join(", ")})`;
}

export async function createNote(
  db: Db,
  input: NoteInput,
  clock: RepoClock = defaultClock,
): Promise<Note> {
  const now = clock.now().toISOString();
  const note: Note = { ...input, id: clock.newId(), createdAt: now, updatedAt: now };
  await runScript(db, noteInsertStatements(note));
  return note;
}

export async function updateNoteContent(
  db: Db,
  id: string,
  content: string,
  plainText: string,
  clock: RepoClock = defaultClock,
): Promise<string> {
  const now = clock.now().toISOString();
  await db.execute("UPDATE notes SET content = ?, plain_text = ?, updated_at = ? WHERE id = ?", [
    content,
    plainText,
    now,
    id,
  ]);
  return now;
}

export async function renameNote(
  db: Db,
  id: string,
  title: string,
  clock: RepoClock = defaultClock,
): Promise<string> {
  const now = clock.now().toISOString();
  await db.execute("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", [title, now, id]);
  return now;
}

export async function setNoteTags(db: Db, id: string, tagIds: readonly string[]): Promise<void> {
  const key = sqlLiteral(id);
  await runScript(db, [
    `DELETE FROM note_tag_links WHERE note_id = ${key}`,
    ...[...new Set(tagIds)].map(
      (tagId) =>
        `INSERT INTO note_tag_links (note_id, tag_id) VALUES (${key}, ${sqlLiteral(tagId)})`,
    ),
  ]);
}

export async function deleteNote(db: Db, id: string): Promise<void> {
  const key = sqlLiteral(id);
  await runScript(db, [
    `DELETE FROM note_tag_links WHERE note_id = ${key}`,
    `DELETE FROM notes WHERE id = ${key}`,
  ]);
}

export async function createTag(
  db: Db,
  campaignId: string,
  name: string,
  clock: RepoClock = defaultClock,
): Promise<NoteTag> {
  const now = clock.now().toISOString();
  const tag: NoteTag = { id: clock.newId(), campaignId, name, createdAt: now, updatedAt: now };
  await db.execute(tagInsertStatement(tag));
  return tag;
}

export async function renameTag(
  db: Db,
  id: string,
  name: string,
  clock: RepoClock = defaultClock,
): Promise<void> {
  await db.execute("UPDATE note_tags SET name = ?, updated_at = ? WHERE id = ?", [
    name,
    clock.now().toISOString(),
    id,
  ]);
}

/** Deletes the tag and takes it off every note. */
export async function deleteTag(db: Db, id: string): Promise<void> {
  const key = sqlLiteral(id);
  await runScript(db, [
    `DELETE FROM note_tag_links WHERE tag_id = ${key}`,
    `DELETE FROM note_tags WHERE id = ${key}`,
  ]);
}

/** Note titles by id; ids that are not found are left out. */
export async function noteTitles(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select<{ id: string; title: string }>(
    `SELECT id, title AS title FROM notes WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Notes of the campaigns for the app-wide search: title, text and tags. */
export async function noteSearchRecords(
  db: Db,
  campaignIds: readonly string[],
): Promise<SearchRecord[]> {
  if (campaignIds.length === 0) return [];
  const where = `campaign_id IN (${placeholders(campaignIds)})`;
  const notes = await db.select<{
    id: string;
    campaign_id: string;
    title: string;
    plain_text: string;
    content: string;
  }>(`SELECT id, campaign_id, title, plain_text, content FROM notes WHERE ${where}`, campaignIds);
  const tags = await db.select<{ note_id: string; name: string }>(
    `SELECT l.note_id, t.name FROM note_tag_links l JOIN note_tags t ON t.id = l.tag_id
     WHERE t.${where}`,
    campaignIds,
  );
  const tagsByNote = new Map<string, string[]>();
  for (const t of tags) tagsByNote.set(t.note_id, [...(tagsByNote.get(t.note_id) ?? []), t.name]);
  return notes.map((r) => ({
    kind: "note",
    id: r.id,
    campaignId: r.campaign_id,
    title: r.title,
    body: [r.plain_text, ...(tagsByNote.get(r.id) ?? [])],
    // A note is found by the current names of what it mentions.
    refs: mentionIds(r.content),
  }));
}

function mentionIds(content: string): string[] {
  if (!content.includes('"mention"')) return [];
  return [...new Set(docMentions(parseDoc(content)).map((m) => m.id))];
}

/** Text notes of the campaign that mention the object. */
export async function notesMentioning(
  db: Db,
  campaignId: string,
  id: string,
): Promise<MentionTarget[]> {
  // The id is unique, so the text filter finds the candidates; the document confirms them.
  const rows = await db.select<{ id: string; title: string; content: string }>(
    "SELECT id, title, content FROM notes WHERE campaign_id = ? AND id <> ? AND instr(content, ?) > 0",
    [campaignId, id, id],
  );
  return rows
    .filter((r) => mentionIds(r.content).includes(id))
    .map((r) => ({ kind: "note", id: r.id, title: r.title }));
}
