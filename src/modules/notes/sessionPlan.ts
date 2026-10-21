// The plan note of a game session: opened if it exists, created with its tag otherwise.
import { getDb } from "../../shared/db";
import { emptyDoc, serializeDoc } from "./domain/doc";
import { findTag } from "./domain/filter";
import { NOTE_TAG_MAX, NOTE_TITLE_MAX } from "./domain/types";
import * as repo from "./repo";
import { showNote } from "./store";

export interface SessionPlanRequest {
  campaignId: string;
  /** The note linked to the session, if any; it may have been deleted. */
  noteId: string | null;
  title: string;
  tagName: string;
}

/**
 * Makes the notes section show the plan and returns its note id. A missing note is created as a
 * text note with the session tag (the tag is created if the campaign has none with that name).
 */
export async function openSessionPlan(request: SessionPlanRequest): Promise<string> {
  const db = await getDb();
  const [notes, tags] = await Promise.all([
    repo.listNotes(db, request.campaignId),
    repo.listTags(db, request.campaignId),
  ]);
  const existing = request.noteId ? notes.find((n) => n.id === request.noteId) : undefined;
  if (existing) {
    showNote(existing, null);
    return existing.id;
  }
  const tagName = request.tagName.slice(0, NOTE_TAG_MAX);
  const tag = findTag(tags, tagName) ?? (await repo.createTag(db, request.campaignId, tagName));
  const note = await repo.createNote(db, {
    campaignId: request.campaignId,
    kind: "text",
    title: request.title.slice(0, NOTE_TITLE_MAX),
    content: serializeDoc(emptyDoc()),
    plainText: "",
    filePath: null,
    tagIds: [tag.id],
  });
  showNote(note, tag);
  return note.id;
}
