import { describe, expect, it } from "vitest";
import {
  docImagePaths,
  docPlainText,
  docToHtml,
  emptyDoc,
  isLibraryPath,
  parseDoc,
  serializeDoc,
  type DocNode,
} from "./doc";

const text = (t: string, marks?: string[]): DocNode =>
  marks
    ? { type: "text", text: t, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: t };
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const cell = (t: string, type = "tableCell"): DocNode => ({ type, content: [p(text(t))] });

const tavern: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [text("Таверна «Пони»")] },
    p(text("Хозяин — "), text("Барлиман", ["bold"]), { type: "hardBreak" }, text("толстый")),
    { type: "image", attrs: { src: "_notes/c1/pony-1234abcd.png", alt: "вывеска" } },
    { type: "image", attrs: { src: "D&D 5e/Люди/barliman.webp" } },
    { type: "image", attrs: { src: "https://example.com/x.png" } },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [cell("Блюдо", "tableHeader"), cell("Цена", "tableHeader")] },
        { type: "tableRow", content: [cell("Эль"), cell("4 мм")] },
      ],
    },
    { type: "bulletList", content: [{ type: "listItem", content: [p(text("пункт"))] }] },
  ],
};

describe("note document", () => {
  it("round-trips through the stored format", () => {
    expect(parseDoc(serializeDoc(tavern))).toEqual(tavern);
  });

  it("reads empty or damaged content as an empty document", () => {
    expect(parseDoc("")).toEqual(emptyDoc());
    expect(parseDoc("{not json")).toEqual(emptyDoc());
    expect(parseDoc(JSON.stringify({ version: 1, doc: { type: "paragraph" } }))).toEqual(
      emptyDoc(),
    );
  });

  it("drops malformed nodes but keeps the rest", () => {
    const raw = JSON.stringify({
      version: 1,
      doc: { type: "doc", content: [42, { type: "paragraph", content: [text("ok")] }, {}] },
    });
    expect(parseDoc(raw)).toEqual({ type: "doc", content: [p(text("ok"))] });
  });

  it("extracts plain text by blocks, table rows with tabs", () => {
    expect(docPlainText(tavern)).toBe(
      ["Таверна «Пони»", "Хозяин — Барлиман", "толстый", "Блюдо\tЦена", "Эль\t4 мм", "пункт"].join(
        "\n",
      ),
    );
  });

  it("lists library image paths once, skipping URLs", () => {
    const doc: DocNode = { type: "doc", content: [...(tavern.content ?? []), tavern.content![2]!] };
    expect(docImagePaths(doc)).toEqual([
      "_notes/c1/pony-1234abcd.png",
      "D&D 5e/Люди/barliman.webp",
    ]);
    expect(isLibraryPath("C:/x.png")).toBe(false);
    expect(isLibraryPath("data:image/png;base64,AA")).toBe(false);
    expect(isLibraryPath("a/b.png")).toBe(true);
  });

  it("renders standalone HTML with escaped text and mapped images", () => {
    const html = docToHtml(tavern, (src) => (src.startsWith("_notes") ? "images/pony.png" : null));
    expect(html).toContain("<h2>Таверна «Пони»</h2>");
    expect(html).toContain("<p>Хозяин — <strong>Барлиман</strong><br>толстый</p>");
    expect(html).toContain('<img src="images/pony.png" alt="вывеска">');
    expect(html).not.toContain("barliman");
    expect(html).toContain("<th><p>Блюдо</p></th>");
    expect(html).toContain("<ul><li><p>пункт</p></li></ul>");
    expect(docToHtml(p(text("<b>&")), () => null)).toBe("<p>&lt;b&gt;&amp;</p>");
  });
});
