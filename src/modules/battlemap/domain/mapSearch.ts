import { buildSearchText, scoreText, tokenize } from "../../../shared/search/text";

/** Maps or templates matching the query by name and tags, best first; all of them when it is empty. */
export function searchMaps<T extends { name: string; tags: readonly string[] }>(
  maps: readonly T[],
  query: string,
): T[] {
  const words = tokenize(query);
  if (words.length === 0) return [...maps];
  return maps
    .map((m, index) => ({
      m,
      index,
      score: scoreText(words, buildSearchText([m.name, ...m.tags])),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.m);
}
