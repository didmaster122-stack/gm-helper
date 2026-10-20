// Attachment files of notes (images from files, PDFs) live in the library under `_notes/`:
// the library is what moves with the user between computers, and service folders are not scanned.
import { safeFileName } from "../../../shared/fs/names";
import { docImagePaths, parseDoc } from "./doc";
import type { Note } from "./types";

export const NOTES_FOLDER = "_notes";
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
export const PDF_EXTENSION = "pdf";

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? "";

/** Lowercase extension of a file name or path, without the dot ("" when none). */
export function extensionOf(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** File name without folders and extension. */
export function baseNameOf(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function isImageFile(path: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

export function isPdfFile(path: string): boolean {
  return extensionOf(path) === PDF_EXTENSION;
}

/**
 * Where a copied file goes: `_notes/<campaign>/<name>-<id>.<ext>`. The original name keeps it
 * recognizable in Explorer; the id part makes it unique.
 */
export function attachmentPath(campaignId: string, sourceName: string, id: string): string {
  const base = safeFileName(baseNameOf(sourceName), "file").slice(0, 80).trim();
  const ext = extensionOf(sourceName) || "bin";
  return `${NOTES_FOLDER}/${campaignId}/${base}-${id.slice(0, 8)}.${ext}`;
}

export function isAttachmentPath(path: string): boolean {
  return path.startsWith(`${NOTES_FOLDER}/`);
}

/** Library files a note uses: its PDF and the images of its text (attachments and arts). */
export function noteFiles(note: Pick<Note, "kind" | "content" | "filePath">): string[] {
  if (note.kind === "pdf") return note.filePath ? [note.filePath] : [];
  return docImagePaths(parseDoc(note.content));
}

/**
 * Attachments among `candidates` that no note uses any more. Only files under `_notes/` are
 * returned: arts of the library are never removed with a note.
 */
export function unusedAttachments(
  candidates: readonly string[],
  notes: readonly Pick<Note, "kind" | "content" | "filePath">[],
): string[] {
  const used = new Set(notes.flatMap(noteFiles).map((p) => p.toLowerCase()));
  return [...new Set(candidates)].filter((p) => isAttachmentPath(p) && !used.has(p.toLowerCase()));
}
