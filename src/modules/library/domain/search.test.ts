import { describe, expect, it } from "vitest";
import { classifyPath } from "./paths";
import {
  buildEntry,
  editDistance,
  matchesSelection,
  normalize,
  searchArts,
  sortArts,
} from "./search";
import type { Art } from "./types";

function art(relPath: string, extra: Partial<Art> = {}): Art {
  return {
    id: relPath,
    relPath,
    ...classifyPath(relPath),
    size: 1,
    mtime: 1,
    hash: null,
    width: null,
    height: null,
    displayName: null,
    tags: [],
    missing: false,
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const library = [
  art("D&D 5e/Нежить/Лич.png"),
  art("D&D 5e/Нежить/skeleton_archer.webp"),
  art("D&D 5e/Драконы/Чёрный дракон.jpg"),
  art("D&D 5e/Драконы/red-dragon.png", { displayName: "Красный дракон", tags: ["босс"] }),
  art("PF2e/Гоблины/goblin-boss.png"),
  art("PF2e/Ёжики/ёж.png"),
  art("D&D 5e/old.png", { missing: true }),
];
const entries = library.map(buildEntry);

const names = (query: string, selection = { kind: "all" } as const) =>
  searchArts(entries, query, selection).map((a) => a.fileName);

describe("normalize", () => {
  it("lowercases, folds ё and splits on separators", () => {
    expect(normalize("  Чёрный_Дракон-v2.final ")).toBe("черный дракон v2 final");
  });
});

describe("editDistance", () => {
  it("counts edits and transpositions", () => {
    expect(editDistance("дракон", "дракон", 2)).toBe(0);
    expect(editDistance("дркаон", "дракон", 2)).toBe(1);
    expect(editDistance("драко", "дракон", 2)).toBe(1);
    expect(editDistance("гоблин", "дракон", 2)).toBe(3);
  });
});

describe("searchArts", () => {
  it("ignores case and treats ё as е in both directions", () => {
    expect(names("ЛИЧ")).toEqual(["Лич.png"]);
    expect(names("черный")).toEqual(["Чёрный дракон.jpg"]);
    expect(names("еж")).toEqual(["ёж.png"]);
  });

  it("matches substrings and word prefixes", () => {
    expect(names("arch")).toEqual(["skeleton_archer.webp"]);
    expect(names("драк")).toEqual(["red-dragon.png", "Чёрный дракон.jpg"]);
  });

  it("tolerates typos and word order", () => {
    expect(names("дркаон чёрный")).toEqual(["Чёрный дракон.jpg"]);
    expect(names("goblni")).toEqual(["goblin-boss.png"]);
  });

  it("searches display names and tags", () => {
    expect(names("красный")).toEqual(["red-dragon.png"]);
    expect(names("босс")).toEqual(["red-dragon.png"]);
  });

  it("filters by having tokens", () => {
    const list = [art("S/G/a.png"), art("S/G/b.png"), art("S/G/c.png")].map(buildEntry);
    const withTokens = new Set([list[1]?.art.id ?? ""]);
    const run = (filter: "any" | "with" | "without") =>
      searchArts(list, "", { kind: "all" }, { filter, artsWithTokens: withTokens }).map(
        (a) => a.fileName,
      );
    expect(run("with")).toEqual(["b.png"]);
    expect(run("without")).toEqual(["a.png", "c.png"]);
    expect(run("any")).toHaveLength(3);
  });

  it("ranks exact matches above fuzzy ones", () => {
    const list = [art("S/G/лич.png"), art("S/G/личинка.png"), art("S/G/лис.png")].map(buildEntry);
    expect(searchArts(list, "лич", { kind: "all" }).map((a) => a.fileName)).toEqual([
      "лич.png",
      "личинка.png",
    ]);
  });

  it("requires every query word to match", () => {
    expect(names("дракон гоблин")).toEqual([]);
  });

  it("returns everything sorted by name for an empty query and hides missing files", () => {
    expect(names("  ")).toHaveLength(6);
    expect(names("old")).toEqual([]);
  });

  it("respects the selection", () => {
    // Sorted by display name: "Красный дракон" before "Чёрный дракон".
    expect(names("", { kind: "group", system: "D&D 5e", group: "Драконы" } as never)).toEqual([
      "red-dragon.png",
      "Чёрный дракон.jpg",
    ]);
    expect(names("boss", { kind: "system", system: "PF2e" } as never)).toEqual(["goblin-boss.png"]);
  });

  it("is fast enough for 10 000 arts", () => {
    const big = Array.from({ length: 10_000 }, (_, i) =>
      buildEntry(art(`S/G/creature_${i}_${i % 7 === 0 ? "дракон" : "гоблин"}.png`)),
    );
    // Best of three: a single cold run is skewed by JIT warm-up and parallel test workers.
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      searchArts(big, "дркон", { kind: "all" });
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(250);
  });
});

describe("matchesSelection", () => {
  const unsorted = art("D&D 5e/loose.png");
  it("keeps unsorted files out of groups but inside their system", () => {
    expect(matchesSelection(unsorted, { kind: "unsorted" })).toBe(true);
    expect(matchesSelection(unsorted, { kind: "system", system: "D&D 5e" })).toBe(true);
    expect(matchesSelection(unsorted, { kind: "group", system: "D&D 5e", group: "x" })).toBe(false);
  });
  it("shows missing files only in the missing view", () => {
    const gone = art("S/G/x.png", { missing: true });
    expect(matchesSelection(gone, { kind: "all" })).toBe(false);
    expect(matchesSelection(gone, { kind: "missing" })).toBe(true);
  });
});

describe("sortArts", () => {
  const arts = [
    art("S/G/Бета.png", { createdAt: "2026-01-02T00:00:00.000Z" }),
    art("S/G/альфа.png", { createdAt: "2026-01-01T00:00:00.000Z" }),
    art("S/G/Гамма.png", { createdAt: "2026-01-03T00:00:00.000Z" }),
  ];
  const names = (list: Art[]) => list.map((a) => a.fileName);
  const tokens = new Map([["S/G/Бета.png", 2]]);
  const count = (id: string) => tokens.get(id) ?? 0;

  it("sorts by name, case-insensitively", () => {
    expect(names(sortArts(arts, "name", count))).toEqual(["альфа.png", "Бета.png", "Гамма.png"]);
  });

  it("puts the newest first", () => {
    expect(names(sortArts(arts, "added", count))).toEqual(["Гамма.png", "Бета.png", "альфа.png"]);
  });

  it("puts arts with more tokens first, then by name", () => {
    expect(names(sortArts(arts, "tokens", count))).toEqual(["Бета.png", "альфа.png", "Гамма.png"]);
  });

  it("does not change the input", () => {
    sortArts(arts, "added", count);
    expect(names(arts)).toEqual(["Бета.png", "альфа.png", "Гамма.png"]);
  });
});
