import { create } from "zustand";
import { getDb } from "../../shared/db";
import { ru } from "../../shared/i18n/ru";
import { baseNameOf, noteFiles } from "./domain/attachments";
import { serializeDoc, emptyDoc } from "./domain/doc";
import { findTag, noFilter, type NoteFilter, type NoteSort } from "./domain/filter";
import { NOTE_TAG_MAX, NOTE_TITLE_MAX, type Note, type NoteTag } from "./domain/types";
import * as repo from "./repo";
import { cleanUpAttachments, copyAttachment, trashUnusedAttachments } from "./service";

type Status = "idle" | "loading" | "ready" | "error";

const NO_CHECKS: ReadonlySet<string> = new Set();

interface NotesState {
  campaignId: string | null;
  status: Status;
  notes: Note[];
  tags: NoteTag[];
  /** The note shown on the right. */
  openId: string | null;
  /** Notes ticked for the archive. */
  checked: ReadonlySet<string>;
  filter: NoteFilter;
  sort: NoteSort;
  load: (campaignId: string, libraryRoot: string, force?: boolean) => Promise<void>;
  open: (id: string | null) => void;
  createText: () => Promise<Note>;
  /** Copies PDF files into the attachments and creates a note for each; opens the last one. */
  addPdfs: (libraryRoot: string, paths: readonly string[]) => Promise<number>;
  rename: (id: string, title: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (libraryRoot: string, id: string) => Promise<void>;
  saveContent: (id: string, content: string, plainText: string) => Promise<void>;
  setNoteTags: (id: string, tagIds: readonly string[]) => Promise<void>;
  /** The tag with this name, created if the campaign has none yet. */
  ensureTag: (name: string) => Promise<NoteTag>;
  renameTag: (id: string, name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  toggleChecked: (id: string) => void;
  check: (ids: readonly string[]) => void;
  clearChecked: () => void;
  setFilter: (filter: Partial<NoteFilter>) => void;
  setSort: (sort: NoteSort) => void;
}

/** Leftover attachments are cleaned up once per app start. */
let cleanedUp = false;

const clip = (text: string, max: number) => text.trim().slice(0, max).trim();

export const useNotesStore = create<NotesState>((set, get) => {
  /** Applies a change to one note in the list. */
  function patch(id: string, change: Partial<Note>) {
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, ...change } : n)) });
  }

  function campaign(): string {
    const id = get().campaignId;
    if (!id) throw new Error("No campaign loaded");
    return id;
  }

  return {
    campaignId: null,
    status: "idle",
    notes: [],
    tags: [],
    openId: null,
    checked: NO_CHECKS,
    filter: noFilter,
    sort: "updated",

    async load(campaignId, libraryRoot, force = false) {
      const same = get().campaignId === campaignId;
      if (same && !force && get().status !== "error") return;
      set({
        campaignId,
        status: "loading",
        ...(same
          ? {}
          : { notes: [], tags: [], openId: null, checked: NO_CHECKS, filter: noFilter }),
      });
      try {
        if (!cleanedUp) {
          cleanedUp = true;
          await cleanUpAttachments(libraryRoot).catch((e: unknown) => console.error(e));
        }
        const db = await getDb();
        const [notes, tags] = await Promise.all([
          repo.listNotes(db, campaignId),
          repo.listTags(db, campaignId),
        ]);
        if (get().campaignId !== campaignId) return;
        set({ notes, tags, status: "ready" });
      } catch (error) {
        console.error(error);
        if (get().campaignId === campaignId) set({ status: "error" });
      }
    },

    open(id) {
      set({ openId: id });
    },

    async createText() {
      const note = await repo.createNote(await getDb(), {
        campaignId: campaign(),
        kind: "text",
        title: ru.notes.untitled,
        content: serializeDoc(emptyDoc()),
        plainText: "",
        filePath: null,
        tagIds: get().filter.untagged ? [] : [...get().filter.tagIds],
      });
      set({ notes: [...get().notes, note], openId: note.id });
      return note;
    },

    async addPdfs(libraryRoot, paths) {
      const campaignId = campaign();
      const db = await getDb();
      const created: Note[] = [];
      for (const path of paths) {
        const filePath = await copyAttachment(libraryRoot, campaignId, path);
        created.push(
          await repo.createNote(db, {
            campaignId,
            kind: "pdf",
            title: clip(baseNameOf(path), NOTE_TITLE_MAX) || ru.notes.untitled,
            content: "",
            plainText: "",
            filePath,
            tagIds: get().filter.untagged ? [] : [...get().filter.tagIds],
          }),
        );
      }
      if (get().campaignId !== campaignId) return created.length;
      set({ notes: [...get().notes, ...created], openId: created.at(-1)?.id ?? get().openId });
      return created.length;
    },

    async rename(id, title) {
      const value = clip(title, NOTE_TITLE_MAX);
      if (value === "") return;
      const updatedAt = await repo.renameNote(await getDb(), id, value);
      patch(id, { title: value, updatedAt });
    },

    async duplicate(id) {
      const source = get().notes.find((n) => n.id === id);
      if (!source) return;
      // Attachments are shared: a file is removed only when no note uses it.
      const copy = await repo.createNote(await getDb(), {
        campaignId: source.campaignId,
        kind: source.kind,
        title: clip(ru.notes.copyTitle(source.title), NOTE_TITLE_MAX),
        content: source.content,
        plainText: source.plainText,
        filePath: source.filePath,
        tagIds: source.tagIds,
      });
      set({ notes: [...get().notes, copy], openId: copy.id });
    },

    async remove(libraryRoot, id) {
      const note = get().notes.find((n) => n.id === id);
      if (!note) return;
      await repo.deleteNote(await getDb(), id);
      const checked = new Set(get().checked);
      checked.delete(id);
      set({
        notes: get().notes.filter((n) => n.id !== id),
        openId: get().openId === id ? null : get().openId,
        checked,
      });
      await trashUnusedAttachments(libraryRoot, noteFiles(note)).catch((e: unknown) =>
        console.error(e),
      );
    },

    async saveContent(id, content, plainText) {
      const updatedAt = await repo.updateNoteContent(await getDb(), id, content, plainText);
      patch(id, { content, plainText, updatedAt });
    },

    async setNoteTags(id, tagIds) {
      await repo.setNoteTags(await getDb(), id, tagIds);
      patch(id, { tagIds: [...new Set(tagIds)] });
    },

    async ensureTag(name) {
      const value = clip(name, NOTE_TAG_MAX);
      const existing = findTag(get().tags, value);
      if (existing) return existing;
      const tag = await repo.createTag(await getDb(), campaign(), value);
      set({ tags: [...get().tags, tag] });
      return tag;
    },

    async renameTag(id, name) {
      const value = clip(name, NOTE_TAG_MAX);
      if (value === "") return;
      await repo.renameTag(await getDb(), id, value);
      set({ tags: get().tags.map((t) => (t.id === id ? { ...t, name: value } : t)) });
    },

    async deleteTag(id) {
      await repo.deleteTag(await getDb(), id);
      const { filter } = get();
      set({
        tags: get().tags.filter((t) => t.id !== id),
        notes: get().notes.map((n) =>
          n.tagIds.includes(id) ? { ...n, tagIds: n.tagIds.filter((t) => t !== id) } : n,
        ),
        filter: { ...filter, tagIds: filter.tagIds.filter((t) => t !== id) },
      });
    },

    toggleChecked(id) {
      const checked = new Set(get().checked);
      if (checked.has(id)) checked.delete(id);
      else checked.add(id);
      set({ checked });
    },

    check(ids) {
      set({ checked: new Set([...get().checked, ...ids]) });
    },

    clearChecked() {
      set({ checked: NO_CHECKS });
    },

    setFilter(filter) {
      set({ filter: { ...get().filter, ...filter } });
    },

    setSort(sort) {
      set({ sort });
    },
  };
});
