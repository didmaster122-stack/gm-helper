// Note use cases that touch files: attachments in the library, the recycle bin, the archive.
import { zipSync, type Zippable } from "fflate";
import { toAbsolute } from "../../shared/catalog/paths";
import { getDb } from "../../shared/db";
import {
  copyNewFile,
  createFolder,
  listNames,
  moveToTrash,
  pathExists,
  readChosenFile,
  writeChosenFile,
  writeOwnLibraryFile,
} from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { planArchive } from "./domain/archive";
import { attachmentPath, extensionOf, NOTES_FOLDER, unusedAttachments } from "./domain/attachments";
import type { Note, NoteTag } from "./domain/types";
import { listNoteFileRefs } from "./repo";

async function prepare(libraryRoot: string, relPath: string): Promise<string> {
  await createFolder(toAbsolute(libraryRoot, relPath.slice(0, relPath.lastIndexOf("/"))));
  return toAbsolute(libraryRoot, relPath);
}

/** Copies a file the user chose into the campaign's attachments; returns its library path. */
export async function copyAttachment(
  libraryRoot: string,
  campaignId: string,
  sourcePath: string,
): Promise<string> {
  const relPath = attachmentPath(campaignId, sourcePath, crypto.randomUUID());
  await copyNewFile(sourcePath, await prepare(libraryRoot, relPath));
  return relPath;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Saves a pasted image (no file behind it) as an attachment; returns its library path. */
export async function saveImageAttachment(
  libraryRoot: string,
  campaignId: string,
  blob: Blob,
): Promise<string> {
  const ext = MIME_EXTENSIONS[blob.type] ?? "png";
  const name = blob instanceof File && extensionOf(blob.name) ? blob.name : `image.${ext}`;
  const relPath = attachmentPath(campaignId, name, crypto.randomUUID());
  await writeOwnLibraryFile(
    await prepare(libraryRoot, relPath),
    new Uint8Array(await blob.arrayBuffer()),
  );
  return relPath;
}

/**
 * Moves the attachments among `candidates` that no note of any campaign uses to the recycle bin
 * (a backup imported next to its original shares the files). Arts of the library are kept.
 */
export async function trashUnusedAttachments(
  libraryRoot: string,
  candidates: readonly string[],
): Promise<void> {
  if (candidates.length === 0) return;
  const unused = unusedAttachments(candidates, await listNoteFileRefs(await getDb()));
  const existing: string[] = [];
  for (const relPath of unused) {
    const path = toAbsolute(libraryRoot, relPath);
    if (await pathExists(path)) existing.push(path);
  }
  if (existing.length > 0) await moveToTrash(existing);
}

/**
 * Attachments left behind by deleted campaigns or by images removed from texts go to the
 * recycle bin. Run once per app start, before anything is edited.
 */
export async function cleanUpAttachments(libraryRoot: string): Promise<void> {
  const folder = toAbsolute(libraryRoot, NOTES_FOLDER);
  if (!(await pathExists(folder))) return;
  const candidates: string[] = [];
  for (const campaign of await listNames(folder)) {
    const files = await listNames(`${folder}/${campaign}`).catch(() => []);
    candidates.push(...files.map((f) => `${NOTES_FOLDER}/${campaign}/${f}`));
  }
  await trashUnusedAttachments(libraryRoot, candidates);
}

export interface ArchiveReport {
  notes: number;
  /** Library paths of files that could not be read. */
  missing: string[];
}

/** Writes the notes as a ZIP that opens without the app to the path the user chose. */
export async function writeArchive(
  libraryRoot: string,
  name: string,
  notes: readonly Note[],
  tags: readonly NoteTag[],
  targetPath: string,
): Promise<ArchiveReport> {
  const entries = planArchive(name, notes, tags, ru.notes.archive.labels);
  const files: Zippable = {};
  const missing: string[] = [];
  const encoder = new TextEncoder();
  for (const entry of entries) {
    if (entry.kind === "html") {
      files[entry.path] = encoder.encode(entry.html);
      continue;
    }
    try {
      // Images and PDFs are compressed already.
      files[entry.path] = [
        await readChosenFile(toAbsolute(libraryRoot, entry.source)),
        { level: 0 },
      ];
    } catch {
      missing.push(entry.source);
    }
  }
  await writeChosenFile(targetPath, zipSync(files, { level: 6 }));
  return { notes: notes.length, missing };
}
