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
