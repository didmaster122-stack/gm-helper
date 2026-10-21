// Mentions of campaign objects (spec §1.6). In a note a mention is a node of the document; in a
// plain text field (a description) it is a token `@[kind:id|label]`. Both keep the object by id
// and the name it had when last written, shown when the object is gone.
import { buildSearchText, scoreText, tokenize } from "../search/text";

export const MENTION_KINDS = ["character", "faction", "event", "note", "battlemap"] as const;

export type MentionKind = (typeof MENTION_KINDS)[number];

export function isMentionKind(value: unknown): value is MentionKind {
  return typeof value === "string" && (MENTION_KINDS as readonly string[]).includes(value);
}

export interface MentionRef {
  kind: MentionKind;
  id: string;
  /** The name when the mention was written. */
  label: string;
}

/** An object that can be mentioned (and where a mention can be). */
export interface MentionTarget {
  kind: MentionKind;
  id: string;
  title: string;
}

export type MentionSegment = { type: "text"; text: string } | { type: "mention"; ref: MentionRef };

const TOKEN = new RegExp(
  `@\\[(${MENTION_KINDS.join("|")}):([0-9A-Za-z-]+)\\|((?:[^\\]\\\\]|\\\\.)*)\\]`,
  "g",
);

const escapeLabel = (label: string) => label.replace(/[\\\]]/g, (c) => `\\${c}`);
const unescapeLabel = (label: string) => label.replace(/\\(.)/g, "$1");

export function formatMention(ref: MentionRef): string {
  return `@[${ref.kind}:${ref.id}|${escapeLabel(ref.label)}]`;
}

/** Text and mentions of a field, in order. */
export function parseMentionText(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const [whole, kind, id, label] = m;
    if (m.index > last) segments.push({ type: "text", text: text.slice(last, m.index) });
    if (isMentionKind(kind) && id !== undefined) {
      segments.push({ type: "mention", ref: { kind, id, label: unescapeLabel(label ?? "") } });
    }
    last = m.index + whole.length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

export function joinMentionSegments(segments: readonly MentionSegment[]): string {
  return segments.map((s) => (s.type === "text" ? s.text : formatMention(s.ref))).join("");
}

/** The field as people read it: each mention becomes the name (`name` gives the current one). */
export function mentionPlainText(
  text: string,
  name: (ref: MentionRef) => string | null = () => null,
): string {
  return parseMentionText(text)
    .map((s) => (s.type === "text" ? s.text : (name(s.ref) ?? s.ref.label)))
    .join("");
}

export function mentionsInText(text: string): MentionRef[] {
  return parseMentionText(text).flatMap((s) => (s.type === "mention" ? [s.ref] : []));
}

/** Points the mentions to new ids (a restored backup); ids not in `ids` stay. */
export function remapMentionText(text: string, ids: ReadonlyMap<string, string>): string {
  if (!text.includes("@[")) return text;
  return joinMentionSegments(
    parseMentionText(text).map((s) =>
      s.type === "mention"
        ? { type: "mention", ref: { ...s.ref, id: ids.get(s.ref.id) ?? s.ref.id } }
        : s,
    ),
  );
}

/** Objects for the `@` list: the best matches of the query, or all in kind order when it is empty. */
export function findMentionTargets(
  targets: readonly MentionTarget[],
  query: string,
  limit: number,
): MentionTarget[] {
  const order = (t: MentionTarget) => MENTION_KINDS.indexOf(t.kind);
  const byName = (a: MentionTarget, b: MentionTarget) =>
    order(a) - order(b) || a.title.localeCompare(b.title, "ru");
  const tokens = tokenize(query);
  if (tokens.length === 0) return [...targets].sort(byName).slice(0, limit);
  return targets
    .map((target) => ({ target, score: scoreText(tokens, buildSearchText([target.title])) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.target, b.target))
    .slice(0, limit)
    .map((r) => r.target);
}
