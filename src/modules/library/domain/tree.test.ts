import { describe, expect, it } from "vitest";
import { classifyPath } from "./paths";
import { buildTree, splitSystems } from "./tree";
import type { Art } from "./types";

function art(relPath: string, missing = false): Art {
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
    missing,
    createdAt: "",
    updatedAt: "",
  };
}

describe("buildTree", () => {
  it("combines folders and arts with counts", () => {
    const tree = buildTree(
      ["PF2e", "D&D 5e", "D&D 5e/Нежить", "D&D 5e/Драконы", "D&D 5e/Пустая"],
      [
        art("D&D 5e/Нежить/a.png"),
        art("D&D 5e/Нежить/b.png"),
        art("D&D 5e/Драконы/c.png"),
        art("D&D 5e/loose.png"),
        art("D&D 5e/Нежить/deep/d.png"),
        art("root.png"),
        art("D&D 5e/Нежить/gone.png", true),
      ],
    );

    expect(tree).toEqual({
      total: 6,
      unsorted: 3,
      missing: 1,
      systems: [
        {
          name: "D&D 5e",
          count: 5,
          groups: [
            { name: "Драконы", count: 1 },
            { name: "Нежить", count: 2 },
            { name: "Пустая", count: 0 },
          ],
        },
        { name: "PF2e", count: 0, groups: [] },
      ],
    });
  });
});

describe("splitSystems", () => {
  const systems = ["D&D 5e", "PF2e", "Savage Worlds"].map((name) => ({
    name,
    count: 0,
    groups: [],
  }));
  const names = (list: { name: string }[]) => list.map((s) => s.name);

  it("puts the preferred system first and hides the rest", () => {
    const { own, others } = splitSystems(systems, "PF2e");
    expect(names(own)).toEqual(["PF2e"]);
    expect(names(others)).toEqual(["D&D 5e", "Savage Worlds"]);
  });

  it("shows every system when the preferred one is not in the library", () => {
    expect(splitSystems(systems, "Fate").others).toEqual([]);
    expect(names(splitSystems(systems, null).own)).toHaveLength(3);
  });
});
