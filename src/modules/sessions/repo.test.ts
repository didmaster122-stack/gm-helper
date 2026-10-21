import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { markPlayed, newSession } from "./domain/sessions";
import { applyChange, listSessions } from "./repo";

describe("session repo", () => {
  let db: Db;
  let n = 0;
  const src = { now: "2026-10-21T10:00:00.000Z", newId: () => `id-${++n}` };

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
    n = 0;
  });

  it("stores sessions with their checklist in order", async () => {
    const first = {
      ...newSession("c1", 1, src, "2026-10-24"),
      planNoteId: "note-1",
      items: [
        { id: "a", text: "Карта склепа", done: true },
        { id: "b", text: "Музыка", done: false },
      ],
    };
    await applyChange(db, { put: [first, newSession("c2", 1, src)], remove: [] });

    expect(await listSessions(db, "c1")).toEqual([first]);

    const moved = { ...first, items: [first.items[1]!, first.items[0]!] };
    await applyChange(db, { put: [moved], remove: [] });
    expect((await listSessions(db, "c1"))[0]?.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("applies a change with new and removed sessions", async () => {
    const s1 = newSession("c1", 1, src);
    await applyChange(db, { put: [s1], remove: [] });
    await applyChange(db, markPlayed([s1], s1.id, "2026-10-21", src));
    let list = await listSessions(db, "c1");
    expect(list.map((s) => [s.number, s.played])).toEqual([
      [1, true],
      [2, false],
    ]);

    await applyChange(db, { put: [], remove: [list[1]!.id] });
    list = await listSessions(db, "c1");
    expect(list).toHaveLength(1);
  });
});
