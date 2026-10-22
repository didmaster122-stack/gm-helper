// What goes into a notes archive: a ZIP that opens without the app (index page, one HTML page
// per text note with its images next to it, PDFs as they are).
import { safeFileName } from "../../../shared/fs/names";
import { baseNameOf, extensionOf } from "./attachments";
import { docImagePaths, docToHtml, escapeHtml, parseDoc, type MentionNamer } from "./doc";
import { sortNotes } from "./filter";
import type { Note, NoteTag } from "./types";

export interface ArchiveLabels {
  /** Link from a note back to the list. */
  back: string;
  tags: string;
  pdf: string;
  text: string;
  /** Shown instead of the list when it is empty. */
  empty: string;
}

export type ArchiveEntry =
  | { path: string; kind: "html"; html: string }
  /** A library file copied as it is; `source` is relative to the library root. */
  | { path: string; kind: "file"; source: string };

/** `<name>.zip`, safe for Windows. */
export function archiveFileName(name: string): string {
  return `${safeFileName(name, "notes")}.zip`;
}

/** Hands out file names that are unique ignoring case (Windows). */
function nameAllocator() {
  const taken = new Set<string>();
  return (base: string, ext: string): string => {
    const clean = safeFileName(base, "note").slice(0, 100).trim() || "note";
    for (let n = 1; ; n++) {
      const name = `${n === 1 ? clean : `${clean} (${n})`}${ext ? `.${ext}` : ""}`;
      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }
  };
}

/** A relative link: each path segment percent-encoded. */
function href(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

// The archive is a standalone document, not app UI: it has its own fixed light colors.
const STYLE = `
body { font: 15px/1.55 "Segoe UI", system-ui, sans-serif; color: #1c1d22; margin: 0; }
main { max-width: 860px; margin: 0 auto; padding: 32px 24px 48px; }
h1 { font-size: 26px; margin: 0 0 8px; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; margin: 12px 0; }
th, td { border: 1px solid #bbb; padding: 4px 8px; vertical-align: top; text-align: left; }
th { background: #f1f1f4; }
th p, td p { margin: 0; }
blockquote { margin: 12px 0; padding-left: 12px; border-left: 3px solid #2c4db0; color: #555; }
pre { background: #f1f1f4; padding: 8px 12px; overflow: auto; }
.tags { color: #61636f; font-size: 13px; margin: 0 0 20px; }
.tag { display: inline-block; padding: 0 8px; margin-left: 4px; border-radius: 10px; background: #e6e6eb; font-size: 12px; }
.back { font-size: 13px; }
ul.notes { list-style: none; padding: 0; }
ul.notes li { padding: 8px 0; border-bottom: 1px solid #e1e1e7; }
.kind { color: #61636f; font-size: 12px; margin-left: 8px; }
@media print { .back { display: none; } }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
}

function chips(names: readonly string[]): string {
  return names.map((n) => `<span class="tag">${escapeHtml(n)}</span>`).join("");
}

function listItem(path: string, title: string, kind: string, tags: readonly string[]): string {
  return `<li><a href="${escapeHtml(href(path))}">${escapeHtml(title)}</a><span class="kind">${escapeHtml(kind)}</span>${chips(tags)}</li>`;
}

/**
 * Files of the archive for the given notes. Images shared by several notes are copied once.
 * Whether the source files still exist is checked when the archive is written.
 */
export function planArchive(
  name: string,
  notes: readonly Note[],
  tags: readonly NoteTag[],
  labels: ArchiveLabels,
  mentionName?: MentionNamer,
): ArchiveEntry[] {
  const allocate = nameAllocator();
  allocate("index", "html");
  const imageNames = nameAllocator();
  const tagNames = new Map(tags.map((t) => [t.id, t.name]));
  const namesOf = (note: Note) =>
    note.tagIds
      .map((id) => tagNames.get(id))
      .filter((n): n is string => n !== undefined)
      .sort((a, b) => a.localeCompare(b, "ru"));

  const entries: ArchiveEntry[] = [];
  const images = new Map<string, string>();
  const items: string[] = [];

  for (const note of sortNotes(notes, "title")) {
    const names = namesOf(note);
    if (note.kind === "pdf") {
      if (!note.filePath) continue;
      const path = allocate(note.title, extensionOf(note.filePath) || "pdf");
      entries.push({ path, kind: "file", source: note.filePath });
      items.push(listItem(path, note.title, labels.pdf, names));
      continue;
    }
    const doc = parseDoc(note.content);
    for (const src of docImagePaths(doc)) {
      if (images.has(src)) continue;
      const path = `images/${imageNames(baseNameOf(src), extensionOf(src))}`;
      images.set(src, path);
      entries.push({ path, kind: "file", source: src });
    }
    const body = docToHtml(
      doc,
      (src) => {
        const image = images.get(src);
        return image ? href(image) : null;
      },
      mentionName,
    );
    const tagLine =
      names.length > 0 ? `<p class="tags">${escapeHtml(labels.tags)}:${chips(names)}</p>` : "";
    const path = allocate(note.title, "html");
    entries.push({
      path,
      kind: "html",
      html: page(
        note.title,
        `<p class="back"><a href="index.html">← ${escapeHtml(labels.back)}</a></p>
<h1>${escapeHtml(note.title)}</h1>
${tagLine}
${body}`,
      ),
    });
    items.push(listItem(path, note.title, labels.text, names));
  }

  const list =
    items.length === 0
      ? `<p>${escapeHtml(labels.empty)}</p>`
      : `<ul class="notes">\n${items.join("\n")}\n</ul>`;
  entries.unshift({
    path: "index.html",
    kind: "html",
    html: page(name, `<h1>${escapeHtml(name)}</h1>\n${list}`),
  });
  return entries;
}
