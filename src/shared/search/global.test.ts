import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchAll, type SearchRecord } from "./global";

const records: SearchRecord[] = [
  { kind: "command", id: "go-notes", campaignId: null, title: "Заметки" },
  { kind: "character", id: "strahd", campaignId: "c1", title: "Страд фон Зарович" },
  { kind: "character", id: "ireena", campaignId: "c1", title: "Ирина Коляна" },
  {
    kind: "event",
    id: "ball",
    campaignId: "c1",
    title: "Бал в замке",
    body: ["Гости съезжаются"],
    refs: ["strahd"],
  },
  {
    kind: "note",
    id: "plan",
    campaignId: "c1",
    title: "План сессии 3",
    body: ["Страд приходит к воротам"],
  },
  { kind: "note", id: "castle", campaignId: "c1", title: "Замок Страда" },
  { kind: "character", id: "other-strahd", campaignId: "c2", title: "Страд" },
  { kind: "art", id: "a1", campaignId: null, title: "strahd portrait", body: ["вампир"] },
];

const index = buildSearchIndex(records);

const ids = (query: string, active: string | null = "c1") =>
  searchAll(index, query, active).map((g) => [g.kind, g.hits.map((h) => h.record.id)]);

describe("searchAll", () => {
  it("finds the character first, then its notes and events", () => {
    expect(ids("страд")).toEqual([
      ["character", ["strahd", "other-strahd"]],
      ["note", ["castle", "plan"]],
      ["event", ["ball"]],
    ]);
  });

  it("puts objects of the active campaign first", () => {
    const groups = searchAll(index, "страд", "c2");
    expect(groups[0]?.hits.map((h) => h.record.id)).toEqual(["other-strahd", "strahd"]);
  });

  it("ignores case and ё, tolerates typos", () => {
    expect(ids("ИРИНА")[0]).toEqual(["character", ["ireena"]]);
    expect(ids("страт фон")[0]).toEqual(["character", ["strahd"]]);
    expect(ids("заметкм")[0]).toEqual(["command", ["go-notes"]]);
  });

  it("finds by body text and by referenced titles", () => {
    expect(ids("гости")).toEqual([["event", ["ball"]]]);
    expect(ids("зарович")).toEqual([
      ["character", ["strahd"]],
      ["event", ["ball"]],
    ]);
    expect(ids("вампир")).toEqual([["art", ["a1"]]]);
  });

  it("limits each group and counts all matches", () => {
    const many = buildSearchIndex(
      Array.from({ length: 12 }, (_, i) => ({
        kind: "art" as const,
        id: `a${i}`,
        campaignId: null,
        title: `Дракон ${i}`,
      })),
    );
    const [group] = searchAll(many, "дракон", null, 5);
    expect(group?.hits).toHaveLength(5);
    expect(group?.total).toBe(12);
  });

  it("returns nothing for an empty query", () => {
    expect(searchAll(index, "  ", "c1")).toEqual([]);
  });
});
