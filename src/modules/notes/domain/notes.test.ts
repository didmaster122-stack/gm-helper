import { describe, expect, it } from "vitest";
import { archiveFileName, planArchive, type ArchiveLabels } from "./archive";
import {
  attachmentPath,
  isImageFile,
  isPdfFile,
  noteFiles,
  unusedAttachments,
} from "./attachments";
import { parseNotesBackup, remapNotes, toNotesBackup } from "./backup";
import { serializeDoc, type DocNode } from "./doc";
import { filterNotes, findTag, matchTags, noFilter, notesWithTag } from "./filter";
import type { Note, NoteTag } from "./types";

const NOW = "2026-10-20T12:00:00.000Z";

function docWith(text: string, images: string[] = []): string {
  const doc: DocNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text }] },
      ...images.map((src) => ({ type: "image", attrs: { src } })),
    ],
  };
  return serializeDoc(doc);
}

function note(id: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    campaignId: "c1",
    kind: "text",
    title: id,
    content: "",
    plainText: "",
    filePath: null,
    tagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

const tag = (id: string, name: string): NoteTag => ({
  id,
  campaignId: "c1",
  name,
  createdAt: NOW,
  updatedAt: NOW,
});

describe("note filter", () => {
  const notes = [
    note("a", {
      title: "Таверна",
      plainText: "Эль и жареный ёж",
      tagIds: ["s3"],
      updatedAt: "2026-10-01T00:00:00Z",
    }),
    note("b", { title: "Ёлка", tagIds: ["s3", "npc"], updatedAt: "2026-10-03T00:00:00Z" }),
    note("c", { title: "Банда", updatedAt: "2026-10-02T00:00:00Z" }),
  ];
  const ids = (list: Note[]) => list.map((n) => n.id);

  it("sorts by last change or by title", () => {
    expect(ids(filterNotes(notes, noFilter, "updated"))).toEqual(["b", "c", "a"]);
    expect(ids(filterNotes(notes, noFilter, "title"))).toEqual(["c", "b", "a"]);
  });

  it("searches title and text ignoring case, ё/е and typos", () => {
    expect(ids(filterNotes(notes, { ...noFilter, query: "ЕЖ" }, "title"))).toEqual(["a"]);
    expect(ids(filterNotes(notes, { ...noFilter, query: "елка" }, "title"))).toEqual(["b"]);
    expect(ids(filterNotes(notes, { ...noFilter, query: "таврна" }, "title"))).toEqual(["a"]);
  });

  it("keeps notes with every chosen tag, or only untagged ones", () => {
    expect(ids(filterNotes(notes, { ...noFilter, tagIds: ["s3"] }, "title"))).toEqual(["b", "a"]);
    expect(ids(filterNotes(notes, { ...noFilter, tagIds: ["s3", "npc"] }, "title"))).toEqual(["b"]);
    expect(ids(filterNotes(notes, { ...noFilter, untagged: true }, "title"))).toEqual(["c"]);
  });

  it("selects notes by tag", () => {
    expect(notesWithTag(notes, "s3")).toEqual(["a", "b"]);
  });

  it("matches and finds tags by name", () => {
    const tags = [tag("1", "Сессия 3"), tag("2", "НПС"), tag("3", "Ёрмунганд")];
    expect(matchTags(tags, "сес").map((t) => t.id)).toEqual(["1"]);
    expect(matchTags(tags, "").map((t) => t.name)).toEqual(["Ёрмунганд", "НПС", "Сессия 3"]);
    expect(findTag(tags, "  сессия   3 ")?.id).toBe("1");
    expect(findTag(tags, "ермунганд")?.id).toBe("3");
    expect(findTag(tags, "Сессия 4")).toBeUndefined();
  });
});

describe("attachments", () => {
  it("builds a unique path under _notes from the source name", () => {
    expect(attachmentPath("c1", "C:\\Загрузки\\Карта: город.PNG", "1234abcd-ffff")).toBe(
      "_notes/c1/Карта_ город-1234abcd.png",
    );
    expect(isImageFile("x.WebP")).toBe(true);
    expect(isPdfFile("a/b.PDF")).toBe(true);
    expect(isImageFile("x.pdf")).toBe(false);
  });

  it("lists the files a note uses", () => {
    expect(noteFiles(note("p", { kind: "pdf", filePath: "_notes/c1/m.pdf" }))).toEqual([
      "_notes/c1/m.pdf",
    ]);
    expect(
      noteFiles(note("t", { content: docWith("x", ["_notes/c1/a.png", "S/G/art.png"]) })),
    ).toEqual(["_notes/c1/a.png", "S/G/art.png"]);
  });

  it("finds unused attachments and never library arts", () => {
    const remaining = [
      note("t", { content: docWith("x", ["_notes/c1/shared.png"]) }),
      note("p", { kind: "pdf", filePath: "_notes/c1/kept.pdf" }),
    ];
    expect(
      unusedAttachments(
        [
          "_notes/c1/shared.png",
          "_notes/c1/gone.png",
          "S/G/art.png",
          "_notes/c1/KEPT.pdf",
          "_notes/c1/gone.png",
        ],
        remaining,
      ),
    ).toEqual(["_notes/c1/gone.png"]);
  });
});

describe("archive plan", () => {
  const labels: ArchiveLabels = {
    back: "К списку",
    tags: "Теги",
    pdf: "PDF",
    text: "Текст",
    empty: "Пусто",
  };
  const tags = [tag("s3", "Сессия 3"), tag("npc", "НПС")];

  it("names the zip safely", () => {
    expect(archiveFileName("Сессия 3: таверна")).toBe("Сессия 3_ таверна.zip");
  });

  it("puts an index, note pages, PDFs and each image once", () => {
    const entries = planArchive(
      "Сессия 3",
      [
        note("a", {
          title: "Таверна",
          content: docWith("эль", ["_notes/c1/pony.png", "S/G/art.png"]),
          tagIds: ["s3", "npc"],
        }),
        note("b", { title: "Таверна", content: docWith("вторая", ["_notes/c1/pony.png"]) }),
        note("m", { title: "Модуль", kind: "pdf", filePath: "_notes/c1/module-1.pdf" }),
        note("x", { title: "Index", content: docWith("") }),
      ],
      tags,
      labels,
    );
    expect(entries.map((e) => e.path)).toEqual([
      "index.html",
      "Модуль.pdf",
      "images/pony.png",
      "images/art.png",
      "Таверна.html",
      "Таверна (2).html",
      "Index (2).html",
    ]);
    const files = entries.filter((e) => e.kind === "file").map((e) => e.source);
    expect(files).toEqual(["_notes/c1/module-1.pdf", "_notes/c1/pony.png", "S/G/art.png"]);

    const page = entries.find((e) => e.path === "Таверна.html");
    expect(page?.kind === "html" && page.html).toContain('<img src="images/pony.png" alt="">');
    expect(page?.kind === "html" && page.html).toContain('НПС</span><span class="tag">Сессия 3');
    const index = entries[0];
    expect(index?.kind === "html" && index.html).toContain(
      `<a href="${encodeURIComponent("Таверна (2)")}.html">Таверна</a>`,
    );
    expect(index?.kind === "html" && index.html).toContain("<title>Сессия 3</title>");
  });
});

describe("notes backup", () => {
  it("round-trips and remaps ids, dropping links to unknown tags", () => {
    const notes = [
      note("a", { title: "Таверна", content: docWith("эль"), tagIds: ["s3", "ghost"] }),
      note("m", { kind: "pdf", title: "Модуль", filePath: "_notes/c1/m.pdf" }),
    ];
    const raw: unknown = JSON.parse(JSON.stringify(toNotesBackup(notes, [tag("s3", "Сессия 3")])));
    const parsed = parseNotesBackup(raw, NOW);
    let n = 0;
    const { tags, notes: out } = remapNotes(parsed, "c2", () => `new-${++n}`, "Без названия");
    expect(tags).toEqual([{ ...tag("new-1", "Сессия 3"), campaignId: "c2" }]);
    expect(out.map((x) => [x.id, x.campaignId, x.tagIds, x.plainText, x.filePath])).toEqual([
      ["new-2", "c2", ["new-1"], "эль", null],
      ["new-3", "c2", [], "", "_notes/c1/m.pdf"],
    ]);
  });

  it("reads a missing or damaged section as empty", () => {
    expect(parseNotesBackup(undefined, NOW)).toEqual({ tags: [], notes: [] });
    expect(
      parseNotesBackup(
        { tags: [{ id: "", name: "x" }], notes: [{ id: "p", kind: "pdf" }, 5] },
        NOW,
      ),
    ).toEqual({ tags: [], notes: [] });
  });
});
