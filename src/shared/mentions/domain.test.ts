import { describe, expect, it } from "vitest";
import {
  findMentionTargets,
  formatMention,
  mentionPlainText,
  mentionsInText,
  parseMentionText,
  remapMentionText,
  type MentionTarget,
} from "./domain";
import { fieldDocToText, textToFieldDoc } from "./field";

const strahd = { kind: "character", id: "c-1", label: "Страд" } as const;

describe("mention text", () => {
  it("round-trips text with mentions", () => {
    const text = `Встреча с ${formatMention(strahd)} в замке`;
    expect(parseMentionText(text)).toEqual([
      { type: "text", text: "Встреча с " },
      { type: "mention", ref: strahd },
      { type: "text", text: " в замке" },
    ]);
    expect(mentionsInText(text)).toEqual([strahd]);
  });

  it("escapes brackets in the label", () => {
    const ref = { kind: "note", id: "n-1", label: "Карта [черновик] \\ 2" } as const;
    expect(mentionsInText(`x${formatMention(ref)}y`)).toEqual([ref]);
  });

  it("leaves text without mentions as it is", () => {
    expect(parseMentionText("@[не упоминание] и @страд")).toEqual([
      { type: "text", text: "@[не упоминание] и @страд" },
    ]);
    expect(parseMentionText("")).toEqual([]);
  });

  it("shows the current name or the saved one", () => {
    const text = `Это ${formatMention(strahd)}.`;
    expect(mentionPlainText(text)).toBe("Это Страд.");
    expect(mentionPlainText(text, () => "Граф Страд")).toBe("Это Граф Страд.");
  });

  it("points mentions to new ids", () => {
    const other = { kind: "event", id: "e-9", label: "Бал" } as const;
    const text = `${formatMention(strahd)} и ${formatMention(other)}`;
    const remapped = remapMentionText(text, new Map([["c-1", "c-2"]]));
    expect(mentionsInText(remapped)).toEqual([{ ...strahd, id: "c-2" }, other]);
  });
});

describe("findMentionTargets", () => {
  const targets: MentionTarget[] = [
    { kind: "event", id: "e", title: "Бал у Страда" },
    { kind: "note", id: "n", title: "План сессии" },
    { kind: "character", id: "s", title: "Страд фон Зарович" },
    { kind: "character", id: "i", title: "Ирина" },
  ];

  it("finds by a part of the name, ё/е and typos", () => {
    expect(findMentionTargets(targets, "страд", 10).map((t) => t.id)).toEqual(["s", "e"]);
    expect(findMentionTargets(targets, "зарович", 10).map((t) => t.id)).toEqual(["s"]);
    expect(findMentionTargets(targets, "страт", 10).map((t) => t.id)).toContain("s");
  });

  it("lists everything by kind for an empty query, up to the limit", () => {
    expect(findMentionTargets(targets, "", 3).map((t) => t.id)).toEqual(["i", "s", "e"]);
  });
});

describe("field document", () => {
  it("turns lines and mentions into paragraphs and back", () => {
    const text = `Первая строка ${formatMention(strahd)}\n\nТретья`;
    const doc = textToFieldDoc(text);
    expect(doc.content).toHaveLength(3);
    expect(doc.content?.[0]?.content?.[1]).toEqual({
      type: "mention",
      attrs: { id: "c-1", kind: "character", label: "Страд" },
    });
    expect(fieldDocToText(doc)).toBe(text);
  });

  it("drops trailing empty lines and broken mentions", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Текст" },
            { type: "mention", attrs: { id: "x", kind: "dragon", label: "?" } },
          ],
        },
        { type: "paragraph" },
      ],
    };
    expect(fieldDocToText(doc)).toBe("Текст");
  });
});
