// Text matching shared by every search in the app (spec §2.4): case and ё/е
// insensitive, substring and fuzzy (typo-tolerant) word matching.

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

/** Normalized words of a searchable item and the same words joined by spaces. */
export interface SearchText {
  words: string[];
  text: string;
}

export function buildSearchText(parts: readonly string[]): SearchText {
  const words = [...new Set(parts.flatMap(tokenize))];
  return { words, text: words.join(" ") };
}

const SCORE = { exact: 4, prefix: 3, substring: 2, fuzzy: 1 } as const;

function scoreToken(token: string, entry: SearchText): number {
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
export function scoreText(queryTokens: readonly string[], entry: SearchText): number {
  let total = 0;
  for (const token of queryTokens) {
    const s = scoreToken(token, entry);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}
