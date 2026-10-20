import { artName, splitExtension } from "./paths";
import type { Art, LibrarySelection } from "./types";

/** Lowercase, ё→е, separators (_ - . , brackets) → spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_\-.,;()[\]{}'"«»]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n === "" ? [] : n.split(" ");
}

/** Optimal string alignment distance, giving up once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2]! + 1);
      }
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Typos allowed for a query word of this length. */
export function allowedTypos(length: number): number {
  if (length < 4) return 0;
  if (length < 7) return 1;
  return 2;
}

export interface SearchEntry {
  art: Art;
  words: string[];
  text: string;
}

/** Searchable text: display name, file name and tags (spec §2.4). */
export function buildEntry(art: Art): SearchEntry {
  const parts = [artName(art), splitExtension(art.fileName).base, ...art.tags];
  const words = [...new Set(parts.flatMap(tokenize))];
  return { art, words, text: words.join(" ") };
}

const SCORE = { exact: 4, prefix: 3, substring: 2, fuzzy: 1 } as const;

function scoreToken(token: string, entry: SearchEntry): number {
  let best = 0;
  const typos = allowedTypos(token.length);
  for (const word of entry.words) {
    if (word === token) return SCORE.exact;
    if (word.startsWith(token)) best = Math.max(best, SCORE.prefix);
    else if (word.includes(token)) best = Math.max(best, SCORE.substring);
    else if (best < SCORE.fuzzy && typos > 0) {
      // Compare with the whole word and with its prefix, so typos work while typing.
      const prefix = word.slice(0, token.length);
      if (
        editDistance(token, word, typos) <= typos ||
        (word.length > token.length && editDistance(token, prefix, typos) <= typos)
      ) {
        best = SCORE.fuzzy;
      }
    }
  }
  // Multi-word names: "черный дракон" should match "черныйдракон" and vice versa.
  if (best === 0 && entry.text.replace(/ /g, "").includes(token)) best = SCORE.substring;
  return best;
}

/** 0 when some query word does not match at all. */
export function scoreEntry(queryTokens: readonly string[], entry: SearchEntry): number {
  let total = 0;
  for (const token of queryTokens) {
    const s = scoreToken(token, entry);
    if (s === 0) return 0;
    total += s;
  }
  return total;
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
    .map((e) => ({ art: e.art, score: scoreEntry(words, e) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.art, b.art))
    .map((r) => r.art);
}
