import { describe, expect, it } from "vitest";
import { buildCatalogTree } from "../../../shared/catalog/tree";
import { buildTrackEntry, searchTracks } from "./search";
import {
  formatDuration,
  isSupportedAudio,
  planTrackScan,
  resolveTrackScan,
  trackLocation,
  trackName,
} from "./tracks";
import type { Track } from "./types";

const NOW = "2026-10-20T12:00:00.000Z";

function track(relPath: string, extra: Partial<Track> = {}): Track {
  return {
    id: relPath,
    relPath,
    ...trackLocation(relPath),
    size: 100,
    mtime: 1,
    hash: `h:${relPath}`,
    durationMs: 60_000,
    displayName: null,
    tags: [],
    missing: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

const ctx = { now: NOW, newId: () => "new-id" };

describe("track names and locations", () => {
  it("accepts the formats WebView2 plays", () => {
    expect(isSupportedAudio("a.MP3")).toBe(true);
    expect(isSupportedAudio("a.flac")).toBe(true);
    expect(isSupportedAudio("a.mid")).toBe(false);
  });

  it("reads category and collection from the path", () => {
    expect(trackLocation("Бой/Эпичные/dragon.mp3")).toEqual({
      category: "Бой",
      collection: "Эпичные",
      unsorted: false,
      fileName: "dragon.mp3",
    });
    expect(trackLocation("loose.mp3").unsorted).toBe(true);
  });

  it("prefers the display name", () => {
    expect(trackName(track("A/B/rain-loop.ogg"))).toBe("rain-loop");
    expect(trackName(track("A/B/rain-loop.ogg", { displayName: "Дождь" }))).toBe("Дождь");
  });

  it("formats durations", () => {
    expect(formatDuration(187_400)).toBe("3:07");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("track sync", () => {
  it("keeps tags and length of a renamed file found by hash", () => {
    const old = track("Бой/Эпичные/old.mp3", { tags: ["дракон"] });
    const plan = planTrackScan([old], [{ relPath: "Бой/Засада/new.mp3", size: 100, mtime: 1 }]);
    const changes = resolveTrackScan(
      plan,
      new Map([["Бой/Засада/new.mp3", { hash: old.hash }]]),
      ctx,
    );
    expect(changes.inserts).toEqual([]);
    expect(changes.updates).toHaveLength(1);
    expect(changes.updates[0]).toMatchObject({
      id: old.id,
      relPath: "Бой/Засада/new.mp3",
      collection: "Засада",
      tags: ["дракон"],
      durationMs: 60_000,
    });
  });

  it("forgets the length when the file content changed", () => {
    const old = track("A/B/t.mp3");
    const plan = planTrackScan([old], [{ relPath: "A/B/t.mp3", size: 200, mtime: 2 }]);
    const changes = resolveTrackScan(plan, new Map([["A/B/t.mp3", { hash: "other" }]]), ctx);
    expect(changes.updates[0]?.durationMs).toBeNull();
  });

  it("adds new files and marks vanished ones missing", () => {
    const gone = track("A/B/gone.mp3");
    const plan = planTrackScan([gone], [{ relPath: "A/B/fresh.mp3", size: 5, mtime: 5 }]);
    const changes = resolveTrackScan(plan, new Map([["A/B/fresh.mp3", { hash: "x" }]]), ctx);
    expect(changes.inserts[0]).toMatchObject({ id: "new-id", durationMs: null, tags: [] });
    expect(changes.markMissing).toEqual([gone.id]);
  });
});

describe("tree and search", () => {
  const tracks = [
    track("Атмосфера/Таверна/crowd.ogg", { tags: ["таверна", "шум"] }),
    track("Атмосфера/Дождь/rain.mp3", { displayName: "Ливень" }),
    track("Бой/Эпичные/dragon.mp3"),
    track("loose.mp3"),
    track("Бой/Эпичные/gone.mp3", { missing: true }),
  ];

  it("counts tracks per category and collection", () => {
    const tree = buildCatalogTree(
      ["Бой/Засада"],
      tracks.map((t) => ({ ...t, top: t.category, sub: t.collection })),
    );
    expect(tree.total).toBe(4);
    expect(tree.unsorted).toBe(1);
    expect(tree.missing).toBe(1);
    expect(tree.tops.map((t) => [t.name, t.count])).toEqual([
      ["Атмосфера", 2],
      ["Бой", 1],
    ]);
    expect(tree.tops[1]?.subs.map((s) => s.name)).toEqual(["Засада", "Эпичные"]);
  });

  it("finds a track by tag, ignoring case and ё", () => {
    const entries = tracks.map(buildTrackEntry);
    expect(searchTracks(entries, "ТАВЕРНА", { kind: "all" }).map((t) => t.fileName)).toEqual([
      "crowd.ogg",
    ]);
    expect(
      searchTracks(entries, "ливень", { kind: "category", category: "Атмосфера" }),
    ).toHaveLength(1);
  });

  it("lists the selection by name without a query", () => {
    const entries = tracks.map(buildTrackEntry);
    expect(
      searchTracks(entries, "", { kind: "category", category: "Атмосфера" }).map(trackName),
    ).toEqual(["Ливень", "crowd"]);
    expect(searchTracks(entries, "", { kind: "missing" })).toHaveLength(1);
  });
});
