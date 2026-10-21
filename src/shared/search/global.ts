// The app-wide search (spec §1.5): records of every section, ranked and grouped by kind.
import { allowedTypos, buildSearchText, compactScore, scoreWord, tokenize } from "./text";

/** Result groups in the order they are shown when their best results rank the same. */
export const SEARCH_KINDS = [
  "command",
  "character",
  "faction",
  "event",
  "note",
  "battlemap",
  "art",
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

/** A searchable object as a module gives it. */
export interface SearchRecord {
  kind: SearchKind;
  id: string;
  /** `null` for objects of no campaign: commands, arts. */
  campaignId: string | null;
  title: string;
  /** A short hint shown next to the title (the folder of an art). */
  detail?: string;
  /** More text that finds the object: description, tags, the text of a note. */
  body?: readonly string[];
  /** Ids of other records whose titles also find this one (the characters of an event). */
  refs?: readonly string[];
}

/** Items of one word: by any of their text and by the title only. */
interface Postings {
  all: number[];
  title: number[];
}

/**
 * Searchable text built once, so typing only scores it. Each distinct word is compared with the
 * query once (typo matching is costly), then lifts the items it occurs in.
 */
export interface SearchIndex {
  records: readonly SearchRecord[];
  words: Map<string, Postings>;
  /** Titles without spaces, for names written together ("черныйдракон"). */
  compactTitles: string[];
}

export function buildSearchIndex(records: readonly SearchRecord[]): SearchIndex {
  const titles = new Map(records.map((r) => [r.id, r.title]));
  const words = new Map<string, Postings>();
  const postings = (word: string) => {
    let p = words.get(word);
    if (!p) words.set(word, (p = { all: [], title: [] }));
    return p;
  };
  const compactTitles: string[] = [];
  records.forEach((record, i) => {
    const referenced = (record.refs ?? []).flatMap((id) => titles.get(id) ?? []);
    const title = buildSearchText([record.title]);
    const all = buildSearchText([record.title, ...(record.body ?? []), ...referenced]);
    for (const w of title.words) postings(w).title.push(i);
    for (const w of all.words) postings(w).all.push(i);
    compactTitles.push(title.text.replace(/ /g, ""));
  });
  return { records, words, compactTitles };
}

export interface SearchHit {
  record: SearchRecord;
  /** The object belongs to the active campaign or to none. */
  own: boolean;
  /** Every query word is found in the title. */
  inTitle: boolean;
  score: number;
}

export interface SearchGroup {
  kind: SearchKind;
  hits: SearchHit[];
  /** All matches of the kind; `hits` holds the best of them. */
  total: number;
}

export const GROUP_LIMIT = 5;

/** Negative when `a` ranks higher; titles are not compared. */
function compareRank(a: SearchHit, b: SearchHit): number {
  if (a.own !== b.own) return a.own ? -1 : 1;
  if (a.inTitle !== b.inTitle) return a.inTitle ? -1 : 1;
  return b.score - a.score;
}

const collator = new Intl.Collator("ru");

function compareHits(a: SearchHit, b: SearchHit): number {
  return compareRank(a, b) || collator.compare(a.record.title, b.record.title);
}

/** The `limit` best hits in order, without sorting thousands of matches of a short query. */
function best(hits: readonly SearchHit[], limit: number): SearchHit[] {
  const top: SearchHit[] = [];
  for (const hit of hits) {
    if (top.length === limit && compareHits(hit, top[limit - 1]!) >= 0) continue;
    let i = top.length;
    while (i > 0 && compareHits(hit, top[i - 1]!) < 0) i--;
    top.splice(i, 0, hit);
    if (top.length > limit) top.pop();
  }
  return top;
}

/**
 * Matches of the query, grouped by kind. Objects of the active campaign come first, then those
 * found by the title, then the better matches. Groups go in the order of their best results.
 */
export function searchAll(
  index: SearchIndex,
  query: string,
  activeCampaignId: string | null,
  limit = GROUP_LIMIT,
): SearchGroup[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const n = index.records.length;
  // Sums over the query words; -1 once some word is not found.
  const titleTotal = new Float64Array(n);
  const allTotal = new Float64Array(n);
  for (const token of tokens) {
    const typos = allowedTypos(token.length);
    const title = new Uint8Array(n);
    const all = new Uint8Array(n);
    for (const [word, p] of index.words) {
      const s = scoreWord(token, word, typos);
      if (s === 0) continue;
      for (const i of p.title) if (s > title[i]!) title[i] = s;
      for (const i of p.all) if (s > all[i]!) all[i] = s;
    }
    for (let i = 0; i < n; i++) {
      if (title[i] === 0) title[i] = compactScore(token, index.compactTitles[i]!);
      if (all[i]! < title[i]!) all[i] = title[i]!;
      titleTotal[i] = title[i] === 0 || titleTotal[i]! < 0 ? -1 : titleTotal[i]! + title[i]!;
      allTotal[i] = all[i] === 0 || allTotal[i]! < 0 ? -1 : allTotal[i]! + all[i]!;
    }
  }
  const byKind = new Map<SearchKind, SearchHit[]>();
  for (let i = 0; i < n; i++) {
    const inTitle = titleTotal[i]! > 0;
    const score = inTitle ? titleTotal[i]! : allTotal[i]!;
    if (score <= 0) continue;
    const record = index.records[i]!;
    const hit: SearchHit = {
      record,
      own: record.campaignId === null || record.campaignId === activeCampaignId,
      inTitle,
      score,
    };
    const list = byKind.get(record.kind);
    if (list) list.push(hit);
    else byKind.set(record.kind, [hit]);
  }
  const groups: SearchGroup[] = [];
  for (const kind of SEARCH_KINDS) {
    const hits = byKind.get(kind);
    if (!hits) continue;
    groups.push({ kind, hits: best(hits, limit), total: hits.length });
  }
  // Stable sort keeps SEARCH_KINDS order between groups whose best results rank the same.
  return groups.sort((a, b) => compareRank(a.hits[0]!, b.hits[0]!));
}
