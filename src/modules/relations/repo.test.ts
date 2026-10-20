import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { addRelation, removeCharacter, updateCharacter } from "./domain/graph";
import { character, faction, relation } from "./domain/testing";
import { emptyGraph, type RelationGraph } from "./domain/types";
import {
  countRelationsOfType,
  createRelationType,
  deleteRelationType,
  graphDiffStatements,
  listRelationTypes,
  loadGraph,
  saveGraphChange,
  updateRelationType,
} from "./repo";

describe("relations repo", () => {
  let db: Db;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
  });

  const graph: RelationGraph = {
    characters: [
      character("b", {
        name: "Борис",
        kind: "pc",
        player: "Аня",
        tags: ["маг"],
        factionIds: ["f2", "f1"],
        artId: "art",
        tokenId: "tok",
        x: 1.5,
        y: -2,
        secrets: "Это 'шпион'",
      }),
      character("a", { name: "Алиса", status: "missing" }),
    ],
    factions: [faction("f1", { name: "Стража" }), faction("f2", { name: "Гильдия" })],
    relations: [relation("r", "a", "f1", { mutual: true, label: "служит", note: "давно" })],
  };

  it("saves a graph and loads it back sorted by name", async () => {
    await saveGraphChange(db, emptyGraph, graph);
    const loaded = await loadGraph(db, "camp");
    expect(loaded.characters.map((c) => c.id)).toEqual(["a", "b"]);
    expect(loaded.characters[1]).toEqual(graph.characters[0]);
    expect(loaded.factions.map((f) => f.name)).toEqual(["Гильдия", "Стража"]);
    expect(loaded.relations).toEqual(graph.relations);
    expect((await loadGraph(db, "other")).characters).toEqual([]);
  });

  it("writes only what changed", async () => {
    await saveGraphChange(db, emptyGraph, graph);
    expect(graphDiffStatements(graph, graph)).toEqual([]);

    const renamed = updateCharacter(graph, "a", { name: "Алиса Б." }, "2026-10-21T00:00:00.000Z");
    expect(graphDiffStatements(graph, renamed)).toHaveLength(1);

    const next = addRelation(removeCharacter(renamed, "b"), relation("r2", "a", "f2"));
    await saveGraphChange(db, graph, next);
    const loaded = await loadGraph(db, "camp");
    expect(loaded.characters.map((c) => c.name)).toEqual(["Алиса Б."]);
    expect(loaded.relations.map((r) => r.id)).toEqual(["r", "r2"]);

    // Undo is the reverse change.
    await saveGraphChange(db, next, graph);
    expect(await loadGraph(db, "camp")).toEqual({
      ...graph,
      characters: [graph.characters[1], graph.characters[0]],
      factions: [graph.factions[1], graph.factions[0]],
    });
  });

  it("has the default relation types", async () => {
    const types = await listRelationTypes(db);
    expect(types.map((t) => t.id)).toEqual([
      "alliance",
      "friendship",
      "enmity",
      "rivalry",
      "love",
      "kinship",
      "service",
      "debt",
      "fear",
      "unknown",
    ]);
    expect(types.every((t) => t.builtin && t.name === "")).toBe(true);
  });

  it("creates, edits and deletes custom types; their relations become unknown", async () => {
    const id = await createRelationType(db, {
      name: " Месть ",
      color: "#ff0000",
      lineStyle: "dotted",
    });
    await updateRelationType(db, "love", {
      name: "Страсть",
      color: "#ff00ff",
      lineStyle: "dashed",
    });
    const types = await listRelationTypes(db);
    expect(types.at(-1)).toEqual({
      id,
      builtin: false,
      name: "Месть",
      color: "#ff0000",
      lineStyle: "dotted",
    });
    expect(types.find((t) => t.id === "love")).toMatchObject({ name: "Страсть", builtin: true });

    await saveGraphChange(db, emptyGraph, {
      ...graph,
      relations: [relation("r", "a", "b", { typeId: id })],
    });
    expect(await countRelationsOfType(db, id)).toBe(1);
    await deleteRelationType(db, id);
    expect((await listRelationTypes(db)).some((t) => t.id === id)).toBe(false);
    expect((await loadGraph(db, "camp")).relations[0]?.typeId).toBe("unknown");
    await expect(deleteRelationType(db, "love")).rejects.toThrow();
  });
});
