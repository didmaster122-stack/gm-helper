import { describe, expect, it } from "vitest";
import { searchMaps } from "./mapSearch";

const maps = [
  { name: "Склеп", tags: ["нежить", "подземелье"] },
  { name: "Таверна «Ёрш»", tags: ["город"] },
  { name: "Лесная поляна", tags: [] },
];

const names = (query: string) => searchMaps(maps, query).map((m) => m.name);

describe("map search", () => {
  it("returns all maps for an empty query", () => {
    expect(names("  ")).toEqual(maps.map((m) => m.name));
  });

  it("matches names and tags ignoring case and ё/е", () => {
    expect(names("ерш")).toEqual(["Таверна «Ёрш»"]);
    expect(names("ГОРОД")).toEqual(["Таверна «Ёрш»"]);
    expect(names("подзем")).toEqual(["Склеп"]);
  });

  it("tolerates typos", () => {
    expect(names("таврена")).toEqual(["Таверна «Ёрш»"]);
    expect(names("нежыть")).toEqual(["Склеп"]);
  });

  it("requires every query word to match", () => {
    expect(names("склеп город")).toEqual([]);
  });
});
