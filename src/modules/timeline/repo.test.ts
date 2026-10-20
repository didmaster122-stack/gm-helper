import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { event, lane, link, marker, timeline } from "./domain/testing";
import { moveEvent, removeEvent, updateEvent } from "./domain/timeline";
import { emptyTimeline, type Timeline } from "./domain/types";
import { loadTimeline, saveTimelineChange, timelineDiffStatements } from "./repo";

const NOW = "2026-10-21T00:00:00.000Z";

describe("timeline repo", () => {
  let db: Db;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
  });

  const stored: Timeline = timeline({
    sessionCount: 4,
    currentSession: 2,
    lanes: [
      lane("main", { kind: "main", name: "", sort: 0 }),
      lane("p", { kind: "personal", name: "Арья", characterId: "c1", sort: 1, hidden: true }),
    ],
    events: [
      event("a", {
        title: "Засада 'у моста'",
        session: 1,
        gameDate: "3-й день Урожая",
        importance: "minor",
        status: "happened",
        characterIds: ["c1", "c2"],
        tags: ["бой"],
      }),
      event("b", { laneId: "p", session: null, status: "failed" }),
    ],
    links: [link("l", "a", "b")],
    markers: [marker("m", { label: "Зима 1492", level: 2, session: null, sort: 1 })],
  });

  it("loads an empty timeline for a campaign that never opened it", async () => {
    expect(await loadTimeline(db, "camp")).toEqual(emptyTimeline);
  });

  it("saves a timeline and loads it back", async () => {
    await saveTimelineChange(db, "camp", emptyTimeline, stored);
    expect(await loadTimeline(db, "camp")).toEqual(stored);
    expect((await loadTimeline(db, "other")).events).toEqual([]);
  });

  it("writes only what changed, and undo is the reverse change", async () => {
    await saveTimelineChange(db, "camp", emptyTimeline, stored);
    expect(timelineDiffStatements("camp", stored, stored)).toEqual([]);

    const edited = updateEvent(stored, "a", { title: "Засада" }, NOW);
    expect(timelineDiffStatements("camp", stored, edited)).toHaveLength(1);

    const next = {
      ...removeEvent(moveEvent(edited, "a", "p", 2, null, NOW), "b"),
      sessionCount: 5,
    };
    await saveTimelineChange(db, "camp", stored, next);
    const loaded = await loadTimeline(db, "camp");
    expect(loaded.sessionCount).toBe(5);
    expect(loaded.events.map((e) => [e.id, e.laneId, e.session])).toEqual([["a", "p", 2]]);
    expect(loaded.links).toEqual([]);

    await saveTimelineChange(db, "camp", next, stored);
    expect(await loadTimeline(db, "camp")).toEqual(stored);
  });
});
