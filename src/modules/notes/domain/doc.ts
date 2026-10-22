// The document of a text note: the editor's JSON tree, stored with a format version.
// Images keep their path relative to the library root in `src`; the editor turns it into a URL.
// Mentions are `mention` nodes with the object's kind, id and the name when written (`label`).
import { isMentionKind, type MentionRef } from "../../../shared/mentions/domain";

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

export const NOTE_CONTENT_VERSION = 1;

export function emptyDoc(): DocNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function serializeDoc(doc: DocNode): string {
  return JSON.stringify({ version: NOTE_CONTENT_VERSION, doc });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Keeps only well-formed nodes, so a damaged part does not break the whole note. */
function readNode(v: unknown): DocNode | null {
  if (!isObject(v) || typeof v.type !== "string") return null;
  const node: DocNode = { type: v.type };
  if (isObject(v.attrs)) node.attrs = v.attrs;
  if (typeof v.text === "string") node.text = v.text;
  if (Array.isArray(v.content)) {
    node.content = v.content.map(readNode).filter((n): n is DocNode => n !== null);
  }
  if (Array.isArray(v.marks)) {
    node.marks = v.marks
      .filter((m): m is Record<string, unknown> => isObject(m) && typeof m.type === "string")
      .map((m) =>
        isObject(m.attrs) ? { type: String(m.type), attrs: m.attrs } : { type: String(m.type) },
      );
  }
  return node;
}

/** A document from the editor (or any JSON value), checked node by node. */
export function toDoc(value: unknown): DocNode {
  const node = readNode(value);
  return node?.type === "doc" ? node : emptyDoc();
}

/** The stored document, or an empty one when the text is empty or unreadable. */
export function parseDoc(text: string): DocNode {
  if (text.trim() === "") return emptyDoc();
  try {
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw)) return emptyDoc();
    const node = readNode(raw.doc);
    return node?.type === "doc" ? node : emptyDoc();
  } catch {
    return emptyDoc();
  }
}

/** The mention a node stands for, if it is a well-formed `mention` node. */
export function mentionOf(node: DocNode): MentionRef | null {
  if (node.type !== "mention") return null;
  const { id, kind, label } = node.attrs ?? {};
  if (typeof id !== "string" || !isMentionKind(kind)) return null;
  return { id, kind, label: typeof label === "string" ? label : "" };
}

/** How a mention reads in text: its saved name unless a current one is given. */
export type MentionNamer = (ref: MentionRef) => string;

const savedName: MentionNamer = (ref) => ref.label;

/** Mentions of the document in order, with repeats. */
export function docMentions(doc: DocNode): MentionRef[] {
  const refs: MentionRef[] = [];
  const walk = (node: DocNode) => {
    const ref = mentionOf(node);
    if (ref) refs.push(ref);
    node.content?.forEach(walk);
  };
  walk(doc);
  return refs;
}

/** Points the mentions to new ids (a restored backup); ids not in `ids` stay. */
export function remapDocMentions(doc: DocNode, ids: ReadonlyMap<string, string>): DocNode {
  const walk = (node: DocNode): DocNode => {
    const ref = mentionOf(node);
    if (ref) {
      const id = ids.get(ref.id);
      return id ? { ...node, attrs: { ...node.attrs, id } } : node;
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node;
  };
  return walk(doc);
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem"]);

/** All text inside a node on one line; blocks and line breaks become spaces. */
function inlineText(node: DocNode, name: MentionNamer): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  const ref = mentionOf(node);
  if (ref) return name(ref);
  const parts = (node.content ?? []).map((n) => inlineText(n, name));
  return parts.join(BLOCKS.has(node.content?.[0]?.type ?? "") ? " " : "").trim();
}

/** Text of the document: one line per block, table cells of a row separated by tabs. */
export function docPlainText(doc: DocNode, name: MentionNamer = savedName): string {
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    if (line.trim() !== "") lines.push(line.trim());
    line = "";
  };
  const walk = (node: DocNode) => {
    const ref = mentionOf(node);
    if (node.type === "text") line += node.text ?? "";
    else if (ref) line += name(ref);
    else if (node.type === "hardBreak") flush();
    else if (node.type === "tableRow") {
      flush();
      line = (node.content ?? []).map((n) => inlineText(n, name)).join("\t");
      flush();
    } else {
      const block = BLOCKS.has(node.type);
      if (block) flush();
      node.content?.forEach(walk);
      if (block) flush();
    }
  };
  walk(doc);
  flush();
  return lines.join("\n");
}

/** A path relative to the library (not a URL like `https:` or `data:`). */
export function isLibraryPath(src: string): boolean {
  return src !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith("/");
}

/** Library paths of the images in the document, without repeats. */
export function docImagePaths(doc: DocNode): string[] {
  const paths = new Set<string>();
  const walk = (node: DocNode) => {
    const src = node.attrs?.src;
    if (node.type === "image" && typeof src === "string" && isLibraryPath(src)) paths.add(src);
    node.content?.forEach(walk);
  };
  walk(doc);
  return [...paths];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  code: "code",
};

const NODE_TAGS: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  listItem: "li",
  blockquote: "blockquote",
  tableRow: "tr",
};

function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 1 ? v : null;
}

/**
 * Standalone HTML of the document (for the archive). `imageUrl` maps an image `src` to the
 * address inside the archive; images it returns null for are left out. Mentions become text.
 */
export function docToHtml(
  doc: DocNode,
  imageUrl: (src: string) => string | null,
  name: MentionNamer = savedName,
): string {
  const children = (node: DocNode) => (node.content ?? []).map(render).join("");
  function render(node: DocNode): string {
    switch (node.type) {
      case "doc":
        return children(node);
      case "text": {
        let html = escapeHtml(node.text ?? "");
        for (const mark of node.marks ?? []) {
          const tag = MARK_TAGS[mark.type];
          if (tag) html = `<${tag}>${html}</${tag}>`;
        }
        return html;
      }
      case "heading": {
        const raw = node.attrs?.level;
        const level = typeof raw === "number" && raw >= 1 && raw <= 6 ? raw : 2;
        return `<h${level}>${children(node)}</h${level}>`;
      }
      case "orderedList": {
        const start = positiveInt(node.attrs?.start);
        return `<ol${start ? ` start="${start}"` : ""}>${children(node)}</ol>`;
      }
      case "codeBlock":
        return `<pre><code>${children(node)}</code></pre>`;
      case "horizontalRule":
        return "<hr>";
      case "hardBreak":
        return "<br>";
      case "mention": {
        const ref = mentionOf(node);
        return ref ? `<span class="mention">${escapeHtml(name(ref))}</span>` : "";
      }
      case "image": {
        const src = node.attrs?.src;
        const url = typeof src === "string" ? imageUrl(src) : null;
        if (url === null) return "";
        const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
        const width = node.attrs?.width;
        const size = typeof width === "number" && width > 0 ? ` width="${Math.round(width)}"` : "";
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${size}>`;
      }
      case "table":
        return `<table><tbody>${children(node)}</tbody></table>`;
      case "tableCell":
      case "tableHeader": {
        const tag = node.type === "tableHeader" ? "th" : "td";
        const colspan = positiveInt(node.attrs?.colspan);
        const rowspan = positiveInt(node.attrs?.rowspan);
        const attrs = `${colspan ? ` colspan="${colspan}"` : ""}${rowspan ? ` rowspan="${rowspan}"` : ""}`;
        return `<${tag}${attrs}>${children(node)}</${tag}>`;
      }
      default: {
        const tag = NODE_TAGS[node.type];
        return tag ? `<${tag}>${children(node)}</${tag}>` : children(node);
      }
    }
  }
  return render(doc);
}
