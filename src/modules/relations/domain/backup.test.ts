import { describe, expect, it } from "vitest";
import { parseGraphBackup, remapGraph, toGraphBackup } from "./backup";
import { character, faction, relation } from "./testing";
import type { RelationGraph, RelationType } from "./types";

const NOW = "2026-10-21T00:00:00.000Z";

const types: RelationType[] = [
  { id: "friendship", builtin: true, name: "Дружба", color: "#5cb85c", lineStyle: "solid" },
  { id: "oath", builtin: false, name: "Клятва", color: "#123456", lineStyle: "dotted" },
  { id: "unused", builtin: false, name: "Лишний", color: "#654321", lineStyle: "solid" },
];

const graph: RelationGraph = {
  characters: [
    character("a", { name: "Аня", factionIds: ["f"], artId: "art1", tokenId: "tok1" }),
    character("b", { name: "Борис", kind: "pc", player: "Ира", tags: ["маг"] }),
  ],
  factions: [faction("f", { name: "Гильдия", artId: "art2" })],
  relations: [
    relation("r1", "a", "b", { typeId: "oath", mutual: true, label: "клятва" }),
    relation("r2", "b", "f"),
  ],
};

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

describe("graph backup", () => {
  it("keeps only the custom relation types the relations use", () => {
    expect(toGraphBackup(graph, types).relationTypes.map((t) => t.id)).toEqual(["oath"]);
  });

  it("survives a JSON round trip", () => {
    const backup = toGraphBackup(graph, types);
    const parsed = parseGraphBackup(JSON.parse(JSON.stringify(backup)), NOW);
    const withoutCampaign = <T extends { campaignId: string }>(items: readonly T[]) =>
      items.map((item) => ({ ...item, campaignId: "" }));
    expect(parsed.characters).toEqual(withoutCampaign(graph.characters));
    expect(parsed.factions).toEqual(withoutCampaign(graph.factions));
    expect(parsed.relations).toEqual(withoutCampaign(graph.relations));
    expect(parsed.relationTypes).toEqual([types[1]]);
  });

  it("skips damaged records and fills defaults", () => {
    const parsed = parseGraphBackup(
      {
        characters: [
          { id: "x", name: "  Икс ", kind: "dragon", status: 5, tags: ["a", 1] },
          { id: "", name: "Без id" },
          { id: "y" },
          "junk",
        ],
        factions: [{ id: "f", name: "Ф", color: "red" }],
        relations: [{ id: "r", fromId: "x" }],
        relationTypes: [{ id: "enmity", name: "Встроенный" }],
      },
      NOW,
    );
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0]).toMatchObject({
      name: "Икс",
      kind: "npc",
      status: "unknown",
      tags: ["a"],
      createdAt: NOW,
    });
    expect(parsed.factions[0]?.color).toBe("#8a8c99");
    expect(parsed.relations).toEqual([]);
    expect(parsed.relationTypes).toEqual([]);
    expect(parseGraphBackup(null, NOW).characters).toEqual([]);
  });

  it("gives new ids and fixes the references", () => {
    const backup = parseGraphBackup(JSON.parse(JSON.stringify(toGraphBackup(graph, types))), NOW);
    const { graph: out, characterIds } = remapGraph(
      backup,
      "camp2",
      counter(),
      (p) => ({ artId: p.artId === "art1" ? "local1" : null, tokenId: null }),
      new Set(["friendship"]),
    );
    const anya = out.characters.find((c) => c.name === "Аня");
    const boris = out.characters.find((c) => c.name === "Борис");
    const guild = out.factions[0];
    expect(anya && boris && guild).toBeTruthy();
    expect(out.characters.every((c) => c.campaignId === "camp2" && c.id.startsWith("new-"))).toBe(
      true,
    );
    expect(anya?.factionIds).toEqual([guild?.id]);
    expect(anya).toMatchObject({ artId: "local1", tokenId: null });
    expect(guild).toMatchObject({ artId: null, campaignId: "camp2" });
    expect(characterIds.get("a")).toBe(anya?.id);

    const [r1, r2] = out.relations;
    expect(r1).toMatchObject({ fromId: anya?.id, toId: boris?.id, mutual: true });
    // "oath" is unknown on this PC (the store would have imported it beforehand).
    expect(r1?.typeId).toBe("unknown");
    expect(r2).toMatchObject({ fromId: boris?.id, toId: guild?.id, typeId: "friendship" });
  });

  it("drops relations whose ends are lost and faction ids that do not exist", () => {
    const { graph: out } = remapGraph(
      {
        characters: [character("a", { factionIds: ["gone"] })],
        factions: [],
        relations: [relation("r", "a", "gone")],
        relationTypes: [],
      },
      "c",
      counter(),
      (p) => p,
      new Set(),
    );
    expect(out.characters[0]?.factionIds).toEqual([]);
    expect(out.relations).toEqual([]);
  });
});
