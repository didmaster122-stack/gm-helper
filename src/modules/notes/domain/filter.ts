import { buildSearchText, scoreText, tokenize, type SearchText } from "../../../shared/search/text";
import type { Note, NoteTag } from "./types";

export type NoteSort = "updated" | "title";

export interface NoteFilter {
  query: string;
  /** A note must have every one of these tags. */
  tagIds: readonly string[];
  /** Only notes without tags (the tag list is ignored then). */
  untagged: boolean;
}

export const noFilter: NoteFilter = { query: "", tagIds: [], untagged: false };

export function isFiltered(filter: NoteFilter): boolean {
  return filter.query.trim() !== "" || filter.tagIds.length > 0 || filter.untagged;
}

const searchCache = new WeakMap<Note, SearchText>();

function searchText(note: Note): SearchText {
  let entry = searchCache.get(note);
  if (!entry) {
    entry = buildSearchText([note.title, note.plainText]);
    searchCache.set(note, entry);
  }
  return entry;
}

export function sortNotes(notes: readonly Note[], sort: NoteSort): Note[] {
  return [...notes].sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title, "ru") || a.id.localeCompare(b.id)
      : b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, "ru"),
  );
}

/** Notes matching the search and tags, in the chosen order. */
export function filterNotes(notes: readonly Note[], filter: NoteFilter, sort: NoteSort): Note[] {
  const query = tokenize(filter.query);
  const shown = notes.filter((n) => {
    if (filter.untagged ? n.tagIds.length > 0 : !filter.tagIds.every((t) => n.tagIds.includes(t))) {
      return false;
    }
    return query.length === 0 || scoreText(query, searchText(n)) > 0;
  });
  return sortNotes(shown, sort);
}

/** Ids of the notes that have the tag. */
export function notesWithTag(notes: readonly Note[], tagId: string): string[] {
  return notes.filter((n) => n.tagIds.includes(tagId)).map((n) => n.id);
}

export function sortTags(tags: readonly NoteTag[]): NoteTag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** Tags whose names match what is typed in the tag picker (case and ё/е insensitive). */
export function matchTags(tags: readonly NoteTag[], typed: string): NoteTag[] {
  const query = normalizeTag(typed);
  const sorted = sortTags(tags);
  return query === "" ? sorted : sorted.filter((t) => normalizeTag(t.name).includes(query));
}

export function normalizeTag(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru").replace(/ё/g, "е");
}

/** The tag with this name (ignoring case and ё/е), if the campaign already has one. */
export function findTag(tags: readonly NoteTag[], name: string): NoteTag | undefined {
  const key = normalizeTag(name);
  return tags.find((t) => normalizeTag(t.name) === key);
}
