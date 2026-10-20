import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../shared/db/migrate";
import { migrations } from "../../shared/db/migrations";
import { createMemoryDb } from "../../shared/db/testing";
import type { Db } from "../../shared/db/types";
import { relocateTrack, trackLocation } from "./domain/tracks";
import type { Track } from "./domain/types";
import { applyTrackScan, deleteTracks, listTracks, saveDurations, saveTracks } from "./repo";

const NOW = "2026-10-20T12:00:00.000Z";

function track(relPath: string, extra: Partial<Track> = {}): Track {
  return {
    id: `id:${relPath}`,
    relPath,
    ...trackLocation(relPath),
    size: 100,
    mtime: 1_700_000_000_000,
    hash: "abc",
    durationMs: null,
    displayName: null,
    tags: [],
    missing: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

let db: Db;

beforeEach(async () => {
  db = createMemoryDb();
  await migrate(db, migrations);
});

describe("tracks repo", () => {
  it("stores scan results and reads them back", async () => {
    const a = track("Бой/Эпичные/dragon.mp3", { tags: ["дракон"] });
    const b = track("loose.ogg");
    await applyTrackScan(db, { inserts: [a, b], updates: [], markMissing: [] }, NOW);
    const list = await listTracks(db);
    expect(list).toHaveLength(2);
    expect(list.find((t) => t.id === a.id)).toEqual(a);

    await applyTrackScan(db, { inserts: [], updates: [], markMissing: [b.id] }, NOW);
    expect((await listTracks(db)).find((t) => t.id === b.id)?.missing).toBe(true);
  });

  it("swaps two names in one save without breaking the unique path", async () => {
    const a = track("A/B/one.mp3");
    const b = track("A/B/two.mp3");
    await applyTrackScan(db, { inserts: [a, b], updates: [], markMissing: [] }, NOW);
    await saveTracks(db, [relocateTrack(a, b.relPath, NOW), relocateTrack(b, a.relPath, NOW)]);
    const byId = new Map((await listTracks(db)).map((t) => [t.id, t.relPath]));
    expect(byId.get(a.id)).toBe("A/B/two.mp3");
    expect(byId.get(b.id)).toBe("A/B/one.mp3");
  });

  it("saves durations and deletes tracks", async () => {
    const a = track("A/B/one.mp3");
    await applyTrackScan(db, { inserts: [a], updates: [], markMissing: [] }, NOW);
    await saveDurations(db, new Map([[a.id, 61_234.6]]));
    expect((await listTracks(db))[0]?.durationMs).toBe(61_235);
    await deleteTracks(db, [a.id]);
    expect(await listTracks(db)).toEqual([]);
  });
});
