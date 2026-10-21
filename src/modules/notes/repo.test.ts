import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import {
  createNote,
  createTag,
  deleteNote,
  deleteTag,
  listNoteFileRefs,
  listNotes,
  listTags,
  noteSearchRecords,
  renameNote,
  renameTag,
  setNoteTags,
  updateNoteContent,
  type NoteInput,
  type RepoClock,
} from "./repo";

function fakeClock(): RepoClock {
  let tick = 0;
  return {
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, tick)),
    newId: () => `id-${++tick}`,
  };
}

const textNote = (campaignId: string, title: string): NoteInput => ({
  campaignId,
  kind: "text",
  title,
  content: "",
  plainText: "",
  filePath: null,
  tagIds: [],
});

describe("notes repo", () => {
  let db: Db;
  let clock: RepoClock;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
    clock = fakeClock();
  });

  it("creates, edits and lists notes with their tags per campaign", async () => {
    const tag = await createTag(db, "c1", "Сессия 3", clock);
    const a = await createNote(db, { ...textNote("c1", "Таверна"), tagIds: [tag.id] }, clock);
    await createNote(db, { ...textNote("c2", "Чужая") }, clock);
    await updateNoteContent(db, a.id, "{}", "эль", clock);
    await renameNote(db, a.id, "Пони", clock);

    const notes = await listNotes(db, "c1");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: "Пони",
      content: "{}",
      plainText: "эль",
      tagIds: [tag.id],
    });
    expect(await listTags(db, "c2")).toEqual([]);
  });

  it("replaces tags of a note and removes a deleted tag from every note", async () => {
    const t1 = await createTag(db, "c1", "А", clock);
    const t2 = await createTag(db, "c1", "Б", clock);
    const a = await createNote(db, textNote("c1", "a"), clock);
    const b = await createNote(db, textNote("c1", "b"), clock);
    await setNoteTags(db, a.id, [t1.id, t2.id, t1.id]);
    await setNoteTags(db, b.id, [t1.id]);
    await renameTag(db, t1.id, "А2", clock);
    await deleteTag(db, t1.id);

    const byId = new Map((await listNotes(db, "c1")).map((n) => [n.id, n.tagIds]));
    expect(byId.get(a.id)).toEqual([t2.id]);
    expect(byId.get(b.id)).toEqual([]);
    expect((await listTags(db, "c1")).map((t) => t.name)).toEqual(["Б"]);
  });

  it("deletes a note with its links and lists file references of all campaigns", async () => {
    const t = await createTag(db, "c1", "А", clock);
    const a = await createNote(db, { ...textNote("c1", "a"), tagIds: [t.id] }, clock);
    await createNote(
      db,
      { ...textNote("c2", "pdf"), kind: "pdf", filePath: "_notes/c2/m.pdf" },
      clock,
    );
    await deleteNote(db, a.id);
    expect(await listNotes(db, "c1")).toEqual([]);
    expect(await db.select("SELECT * FROM note_tag_links")).toEqual([]);
    expect(await listNoteFileRefs(db)).toEqual([
      { kind: "pdf", content: "", filePath: "_notes/c2/m.pdf" },
    ]);
  });

  it("gives notes of the asked campaigns for the app-wide search", async () => {
    const tag = await createTag(db, "c1", "Сессия 3", clock);
    const a = await createNote(db, { ...textNote("c1", "Замок"), tagIds: [tag.id] }, clock);
    await updateNoteContent(db, a.id, "{}", "Страд ждёт", clock);
    await createNote(db, textNote("c2", "Чужая"), clock);
    await createNote(db, textNote("c3", "Архив"), clock);

    const records = await noteSearchRecords(db, ["c1", "c2"]);
    expect(records.map((r) => r.title).sort()).toEqual(["Замок", "Чужая"]);
    expect(records.find((r) => r.id === a.id)).toMatchObject({
      kind: "note",
      campaignId: "c1",
      body: ["Страд ждёт", "Сессия 3"],
    });
    expect(await noteSearchRecords(db, [])).toEqual([]);
  });
});
