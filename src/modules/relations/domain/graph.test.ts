import { describe, expect, it } from "vitest";
import { noFilter, searchGraph, splitInnerRelations, visibleGraph } from "./filter";
import {
  CHARACTER_H,
  CHARACTER_W,
  EMPTY_FRAME_W,
  FRAME_HEADER,
  FRAME_PAD,
  characterShape,
  clipToShape,
  factionFrames,
  freeSpot,
  parallelOffsets,
  relationPath,
} from "./geometry";
import {
  moveNodes,
  removeCharacter,
  removeFaction,
  updateCharacter,
  withMainFaction,
} from "./graph";
import { forceLayout, syncFactionPositions } from "./layout";
import { character, faction, relation } from "./testing";
import type { RelationGraph } from "./types";

const NOW = "2026-10-21T00:00:00.000Z";

describe("graph edits", () => {
  const graph: RelationGraph = {
    characters: [character("a", { factionIds: ["f"] }), character("b")],
    factions: [faction("f")],
    relations: [relation("r1", "a", "b"), relation("r2", "b", "f"), relation("r3", "f", "a")],
  };

  it("keeps unchanged entities and the graph itself by reference", () => {
    expect(updateCharacter(graph, "a", { name: "a" }, NOW)).toBe(graph);
    expect(updateCharacter(graph, "a", { factionIds: ["f"] }, NOW)).toBe(graph);
    const next = updateCharacter(graph, "a", { name: "Алиса" }, NOW);
    expect(next.characters[0]).toMatchObject({ name: "Алиса", updatedAt: NOW });
    expect(next.characters[1]).toBe(graph.characters[1]);
    expect(next.relations).toBe(graph.relations);
  });

  it("removes the relations of a removed character", () => {
    const next = removeCharacter(graph, "a");
    expect(next.characters.map((c) => c.id)).toEqual(["b"]);
    expect(next.relations.map((r) => r.id)).toEqual(["r2"]);
  });

  it("removes a faction from its members and its relations", () => {
    const next = removeFaction(graph, "f", NOW);
    expect(next.factions).toEqual([]);
    expect(next.characters[0]?.factionIds).toEqual([]);
    expect(next.characters[1]).toBe(graph.characters[1]);
    expect(next.relations.map((r) => r.id)).toEqual(["r1"]);
  });

  it("moves nodes and returns the same graph when nothing moved", () => {
    expect(moveNodes(graph, new Map([["a", { x: 0, y: 0 }]]), NOW)).toBe(graph);
    const next = moveNodes(graph, new Map([["f", { x: 5, y: 6 }]]), NOW);
    expect(next.factions[0]).toMatchObject({ x: 5, y: 6 });
    expect(next.characters).toEqual(graph.characters);
  });

  it("puts the main faction first", () => {
    expect(withMainFaction(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(withMainFaction(["a"], "z")).toEqual(["z", "a"]);
  });
});

describe("geometry", () => {
  it("frames the members whose main faction it is", () => {
    const frames = factionFrames(
      [faction("f"), faction("g", { x: 500, y: 600 })],
      [
        character("a", { x: 100, y: 100, factionIds: ["f"] }),
        character("b", { x: 300, y: 200, factionIds: ["f", "g"] }),
      ],
    );
    expect(frames.get("f")).toEqual({
      x: 100 - FRAME_PAD,
      y: 100 - FRAME_PAD - FRAME_HEADER,
      width: 200 + CHARACTER_W + 2 * FRAME_PAD,
      height: 100 + CHARACTER_H + 2 * FRAME_PAD + FRAME_HEADER,
    });
    // "b" is only a secondary member of "g": the frame stays empty, at the faction's position.
    expect(frames.get("g")).toMatchObject({ x: 500, y: 600, width: EMPTY_FRAME_W });
  });

  it("clips lines at the border of circles and rectangles", () => {
    expect(clipToShape({ kind: "circle", cx: 0, cy: 0, r: 10 }, { x: 100, y: 0 })).toEqual({
      x: 10,
      y: 0,
    });
    const rect = { kind: "rect" as const, rect: { x: 0, y: 0, width: 100, height: 50 } };
    expect(clipToShape(rect, { x: 50, y: 225 })).toEqual({ x: 50, y: 50 });
    expect(clipToShape(rect, { x: 250, y: 25 })).toEqual({ x: 100, y: 25 });
  });

  it("spreads parallel relations of one pair symmetrically", () => {
    const offsets = parallelOffsets([
      relation("r1", "a", "b"),
      relation("r2", "b", "a"),
      relation("r3", "a", "b"),
      relation("r4", "a", "c"),
    ]);
    expect(offsets.get("r4")).toBe(0);
    expect([offsets.get("r1"), offsets.get("r2"), offsets.get("r3")]).toEqual([-28, 0, 28]);
  });

  it("draws opposite relations of a pair on different sides", () => {
    const a = characterShape({ x: 0, y: 0 });
    const b = characterShape({ x: 400, y: 0 });
    // Offsets are relative to the pair, not to the direction of each relation.
    const ab = relationPath("a", a, "b", b, -14);
    const ba = relationPath("b", b, "a", a, 14);
    const centreY = 36;
    expect(Math.sign(ab.label.y - centreY)).toBe(-Math.sign(ba.label.y - centreY));
    expect(relationPath("b", b, "a", a, -14).label).toEqual(ab.label);
    expect(relationPath("a", a, "b", b, 0).d).toMatch(/^M [\d.]+,[\d.]+ L /);
  });

  it("finds a free spot below the graph", () => {
    expect(freeSpot([], [])).toEqual({ x: 0, y: 0 });
    const spot = freeSpot([character("a", { x: 10, y: 20 })], []);
    expect(spot).toEqual({ x: 10, y: 20 + CHARACTER_H + 60 });
  });
});

describe("filters", () => {
  const graph: RelationGraph = {
    characters: [
      character("pc", { kind: "pc", factionIds: ["guild"] }),
      character("friend"),
      character("dead", { status: "dead" }),
      character("far"),
      character("watchman", { factionIds: ["watch"] }),
    ],
    factions: [faction("guild"), faction("watch"), faction("empty")],
    relations: [
      relation("r1", "pc", "friend", { typeId: "friendship" }),
      relation("r2", "dead", "pc", { typeId: "enmity" }),
      relation("r3", "friend", "far", { typeId: "friendship" }),
      relation("r4", "guild", "watch", { typeId: "enmity" }),
    ],
  };

  it("shows everything without a filter", () => {
    const v = visibleGraph(graph, noFilter);
    expect(v.characters.size).toBe(5);
    expect(v.factions.size).toBe(3);
    expect(v.relations.size).toBe(4);
  });

  it("hides dead characters with their relations", () => {
    const v = visibleGraph(graph, { ...noFilter, hideDead: true });
    expect(v.characters.has("dead")).toBe(false);
    expect([...v.relations].sort()).toEqual(["r1", "r3", "r4"]);
  });

  it("filters by relation type and by faction", () => {
    expect([
      ...visibleGraph(graph, { ...noFilter, typeIds: new Set(["enmity"]) }).relations,
    ]).toEqual(["r2", "r4"]);
    const v = visibleGraph(graph, { ...noFilter, factionIds: new Set(["watch"]) });
    expect([...v.characters]).toEqual(["watchman"]);
    expect([...v.factions]).toEqual(["watch"]);
    expect(v.relations.size).toBe(0);
  });

  it("shows only player characters and their direct relations", () => {
    const v = visibleGraph(graph, { ...noFilter, onlyPcs: true });
    expect([...v.characters].sort()).toEqual(["dead", "friend", "pc"]);
    expect([...v.relations].sort()).toEqual(["r1", "r2"]);
    expect([...v.factions]).toEqual(["guild"]);
  });

  it("searches characters ignoring case, ё and typos", () => {
    const g: RelationGraph = {
      characters: [
        character("1", { name: "Фёдор Тёмный" }),
        character("2", { name: "Ольга", role: "трактирщица" }),
      ],
      factions: [faction("3", { name: "Городская стража" })],
      relations: [],
    };
    expect(searchGraph(g, "федор").map((h) => h.id)).toEqual(["1"]);
    expect(searchGraph(g, "ТРАКТИР").map((h) => h.id)).toEqual(["2"]);
    expect(searchGraph(g, "стража").map((h) => h.kind)).toEqual(["faction"]);
    expect(searchGraph(g, "темнвй").map((h) => h.id)).toEqual(["1"]);
    expect(searchGraph(g, "  ")).toEqual([]);
  });
});

describe("layout", () => {
  it("is deterministic and separates nodes placed on one spot", () => {
    const graph: RelationGraph = {
      characters: ["a", "b", "c", "d"].map((id) => character(id, { x: 50, y: 70 })),
      factions: [],
      relations: [relation("r1", "a", "b"), relation("r2", "c", "d")],
    };
    const first = forceLayout(graph, { iterations: 200 });
    expect(forceLayout(graph, { iterations: 200 })).toEqual(first);
    const points = [...first.values()];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
        expect(d).toBeGreaterThan(CHARACTER_W);
      }
    }
    // The whole graph keeps its top-left corner.
    expect(Math.min(...points.map((p) => p.x))).toBe(50);
    expect(Math.min(...points.map((p) => p.y))).toBe(70);
  });

  it("keeps faction members closer to each other than to strangers", () => {
    const graph: RelationGraph = {
      characters: [
        character("a1", { x: 0, y: 0, factionIds: ["A"] }),
        character("b1", { x: 10, y: 0, factionIds: ["B"] }),
        character("a2", { x: 20, y: 0, factionIds: ["A"] }),
        character("b2", { x: 30, y: 0, factionIds: ["B"] }),
      ],
      factions: [faction("A"), faction("B")],
      relations: [],
    };
    const p = forceLayout(graph);
    const dist = (a: string, b: string) =>
      Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
    expect(dist("a1", "a2")).toBeLessThan(dist("a1", "b1"));
    expect(dist("b1", "b2")).toBeLessThan(dist("a2", "b2"));
  });

  it("keeps characters without relations close together", () => {
    const characters = Array.from({ length: 12 }, (_, i) =>
      character(`c${i}`, { x: (i % 4) * 200, y: Math.floor(i / 4) * 150 }),
    );
    const points = [...forceLayout({ characters, factions: [], relations: [] }).values()];
    const extent = (axis: "x" | "y") =>
      Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
    // Roughly a 4×3 grid at the preferred distance (240), not scattered across the canvas.
    expect(extent("x")).toBeLessThan(2000);
    expect(extent("y")).toBeLessThan(2000);
  });

  it("stores the frame position of factions with members", () => {
    const graph: RelationGraph = {
      characters: [character("a", { x: 100, y: 100, factionIds: ["f"] })],
      factions: [faction("f"), faction("empty", { x: 9, y: 9 })],
      relations: [],
    };
    const next = syncFactionPositions(graph, NOW);
    expect(next.factions[0]).toMatchObject({
      x: 100 - FRAME_PAD,
      y: 100 - FRAME_PAD - FRAME_HEADER,
    });
    expect(next.factions[1]).toBe(graph.factions[1]);
    expect(syncFactionPositions(next, NOW)).toBe(next);
  });
});

describe("relations inside a faction frame", () => {
  it("are not drawn when they link a character with its main faction", () => {
    const characters = [
      character("a", { factionIds: ["guild", "watch"] }),
      character("b", { factionIds: ["watch"] }),
    ];
    const relations = [
      relation("r1", "a", "guild"),
      relation("r2", "guild", "a"),
      relation("r3", "a", "watch"),
      relation("r4", "watch", "b"),
      relation("r5", "a", "b"),
    ];
    const { drawn, inner } = splitInnerRelations(relations, characters);
    expect(drawn.map((r) => r.id)).toEqual(["r3", "r5"]);
    expect(inner.get("a")?.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(inner.get("b")?.map((r) => r.id)).toEqual(["r4"]);
  });
});
