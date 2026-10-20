import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { classifyPath } from "./domain/paths";
import type { Art } from "./domain/types";
import { applyScanChanges, deleteArts, insertArts, listArts, relocate, saveArts } from "./repo";

const NOW = "2026-10-20T12:00:00.000Z";

function art(relPath: string, extra: Partial<Art> = {}): Art {
  return {
    id: `id:${relPath}`,
    relPath,
    ...classifyPath(relPath),
    size: 100,
    mtime: 1_700_000_000_000,
    hash: "abc",
    width: 512,
    height: 768,
    displayName: null,
    tags: [],
    missing: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

describe("library repo", () => {
  let db: Db;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
  });

  it("round-trips arts including tags, nulls and quotes", async () => {
    const a = art("D&D 5e/Нежить/O'Brien.png", { tags: ["босс", "it's"], displayName: "Лич" });
    const b = art("loose.png", { hash: null, width: null, height: null });

    await insertArts(db, [a, b]);

    const stored = await listArts(db);
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual(a);
    expect(stored).toContainEqual(b);
  });

  it("applies scan changes atomically", async () => {
    const moved = art("S/G/a.png");
    const gone = art("S/G/b.png");
    await insertArts(db, [moved, gone]);

    await applyScanChanges(
      db,
      {
        inserts: [art("S/G/new.png")],
        updates: [relocate(moved, "S/H/a.png", NOW)],
        markMissing: [gone.id],
      },
      NOW,
    );

    const byId = new Map((await listArts(db)).map((x) => [x.id, x]));
    expect(byId.get(moved.id)).toMatchObject({ relPath: "S/H/a.png", group: "H" });
    expect(byId.get(gone.id)?.missing).toBe(true);
    expect(byId.has("id:S/G/new.png")).toBe(true);
  });

  it("allows swapping two paths in one save", async () => {
    const a = art("S/G/a.png");
    const b = art("S/G/b.png");
    await insertArts(db, [a, b]);

    await saveArts(db, [relocate(a, "S/G/b.png", NOW), relocate(b, "S/G/a.png", NOW)]);

    const byId = new Map((await listArts(db)).map((x) => [x.id, x.relPath]));
    expect(byId.get(a.id)).toBe("S/G/b.png");
    expect(byId.get(b.id)).toBe("S/G/a.png");
  });

  it("deletes arts", async () => {
    await insertArts(db, [art("S/G/a.png"), art("S/G/b.png")]);
    await deleteArts(db, ["id:S/G/a.png"]);
    expect((await listArts(db)).map((x) => x.relPath)).toEqual(["S/G/b.png"]);
  });
});
