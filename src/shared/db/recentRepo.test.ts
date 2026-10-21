import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { migrations } from "./migrations";
import { forgetRecent, listRecent, RECENT_KEEP, recordRecent, type RecentItem } from "./recentRepo";
import { createMemoryDb } from "./testing";
import type { Db } from "./types";

const at = (minute: number) => `2026-10-21T10:${String(minute).padStart(2, "0")}:00.000Z`;
const item = (objectId: string, minute: number, campaignId = "c1"): RecentItem => ({
  campaignId,
  kind: "note",
  objectId,
  openedAt: at(minute),
});

describe("recent items repo", () => {
  let db: Db;

  beforeEach(async () => {
    db = createMemoryDb();
    await migrate(db, migrations);
  });

  it("lists a campaign's objects newest first, reopening moves one up", async () => {
    await recordRecent(db, item("a", 1));
    await recordRecent(db, item("b", 2));
    await recordRecent(db, item("x", 3, "c2"));
    await recordRecent(db, item("a", 4));
    expect((await listRecent(db, "c1")).map((i) => i.objectId)).toEqual(["a", "b"]);
  });

  it("keeps only the newest rows of the campaign", async () => {
    for (let m = 0; m < RECENT_KEEP + 3; m++) await recordRecent(db, item(`n${m}`, m));
    await recordRecent(db, item("other", 0, "c2"));
    const kept = await listRecent(db, "c1");
    expect(kept).toHaveLength(RECENT_KEEP);
    expect(kept.at(-1)?.objectId).toBe("n3");
    expect(await listRecent(db, "c2")).toHaveLength(1);
  });

  it("forgets the given objects", async () => {
    await recordRecent(db, item("a", 1));
    await recordRecent(db, { ...item("a", 2), kind: "art" });
    await forgetRecent(db, [item("a", 1)]);
    expect((await listRecent(db, "c1")).map((i) => i.kind)).toEqual(["art"]);
  });
});
