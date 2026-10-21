import type { SearchRecord } from "../../../shared/search/global";
import { buildSearchText, scoreText, tokenize, type SearchText } from "../../../shared/search/text";
import { artName, splitExtension } from "./paths";
import type { Art, LibrarySelection } from "./types";

export { editDistance, normalize, tokenize } from "../../../shared/search/text";

export interface SearchEntry extends SearchText {
  art: Art;
}

/** Searchable text: display name, file name and tags (spec §2.4). */
export function buildEntry(art: Art): SearchEntry {
  return {
    art,
    ...buildSearchText([artName(art), splitExtension(art.fileName).base, ...art.tags]),
  };
}

/** Arts on disk for the app-wide search, with the folder as a hint. */
export function artSearchRecords(arts: readonly Art[]): SearchRecord[] {
  return arts
    .filter((art) => !art.missing)
    .map((art) => ({
      kind: "art",
      id: art.id,
      campaignId: null,
      title: artName(art),
      detail: [art.system, art.group].filter((p) => p !== null).join(" / "),
      body: [splitExtension(art.fileName).base, ...art.tags],
    }));
}

export function matchesSelection(art: Art, selection: LibrarySelection): boolean {
  switch (selection.kind) {
    case "missing":
      return art.missing;
    case "all":
      return !art.missing;
    case "unsorted":
      return !art.missing && art.unsorted;
    case "system":
      return !art.missing && art.system === selection.system;
    case "group":
      return (
        !art.missing &&
        !art.unsorted &&
        art.system === selection.system &&
        art.group === selection.group
      );
  }
}

function byName(a: Art, b: Art): number {
  return artName(a).localeCompare(artName(b), "ru", { sensitivity: "base", numeric: true });
}

export type ArtSort = "name" | "added" | "tokens";

/** Orders arts for browsing: by name, newest first, or most tokens first (ties by name). */
export function sortArts(
  arts: readonly Art[],
  sort: ArtSort,
  tokenCount: (artId: string) => number,
): Art[] {
  const list = [...arts];
  switch (sort) {
    case "name":
      return list.sort(byName);
    case "added":
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
    case "tokens":
      return list.sort((a, b) => tokenCount(b.id) - tokenCount(a.id) || byName(a, b));
  }
}

export type TokenFilter = "any" | "with" | "without";

export interface TokenFilterInput {
  filter: TokenFilter;
  /** Ids of arts that have at least one token. */
  artsWithTokens: ReadonlySet<string>;
}

function matchesTokenFilter(art: Art, input: TokenFilterInput | undefined): boolean {
  if (!input || input.filter === "any") return true;
  return input.artsWithTokens.has(art.id) === (input.filter === "with");
}

/** Arts in the selection matching the query, best matches first; all of them by name if the query is empty. */
export function searchArts(
  entries: readonly SearchEntry[],
  query: string,
  selection: LibrarySelection,
  tokenFilter?: TokenFilterInput,
): Art[] {
  const words = tokenize(query);
  const inSelection = entries.filter(
    (e) => matchesSelection(e.art, selection) && matchesTokenFilter(e.art, tokenFilter),
  );
  if (words.length === 0) return inSelection.map((e) => e.art).sort(byName);

  return inSelection
    .map((e) => ({ art: e.art, score: scoreText(words, e) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.art, b.art))
    .map((r) => r.art);
}
