import { describe, expect, it } from "vitest";
import { classifyPath } from "./paths";
import { filesToInspect, planScan, resolveScan, type ResolveContext } from "./reconcile";
import type { Art, FileInspection, FoundFile } from "./types";

const NOW = "2026-10-20T12:00:00.000Z";

function art(relPath: string, extra: Partial<Art> = {}): Art {
  return {
    id: `id:${relPath}`,
    relPath,
    ...classifyPath(relPath),
    size: 100,
    mtime: 1,
    hash: `hash:${relPath}`,
    width: 10,
    height: 10,
    displayName: null,
    tags: [],
    missing: false,
    createdAt: "old",
    updatedAt: "old",
    ...extra,
  };
}

function file(relPath: string, extra: Partial<FoundFile> = {}): FoundFile {
  return { relPath, size: 100, mtime: 1, ...extra };
}

function ctx(): ResolveContext {
  let n = 0;
  return { now: NOW, newId: () => `new-${++n}` };
}

function inspect(entries: Record<string, string | null>): Map<string, FileInspection> {
  return new Map(
    Object.entries(entries).map(([path, hash]) => [path, { hash, width: 20, height: 30 }]),
  );
}

describe("planScan", () => {
  it("splits files into unchanged, changed, added and vanished", () => {
    const existing = [
      art("S/G/same.png"),
      art("S/G/edited.png"),
      art("S/G/unhashed.png", { hash: null }),
      art("S/G/gone.png"),
    ];
    const found = [
      file("S/G/same.png"),
      file("S/G/edited.png", { mtime: 2 }),
      file("S/G/unhashed.png"),
      file("S/G/new.png"),
    ];

    const plan = planScan(existing, found);

    expect(plan.unchanged.map((a) => a.relPath)).toEqual(["S/G/same.png"]);
    expect(plan.changed.map((c) => c.entry.relPath)).toEqual([
      "S/G/edited.png",
      "S/G/unhashed.png",
    ]);
    expect(plan.added.map((f) => f.relPath)).toEqual(["S/G/new.png"]);
    expect(plan.vanished.map((a) => a.relPath)).toEqual(["S/G/gone.png"]);
    expect(filesToInspect(plan).map((f) => f.relPath)).toEqual([
      "S/G/edited.png",
      "S/G/unhashed.png",
      "S/G/new.png",
    ]);
  });
});

describe("resolveScan", () => {
  it("inserts new files", () => {
    const plan = planScan([], [file("S/G/lich.png")]);

    const changes = resolveScan(plan, inspect({ "S/G/lich.png": "h1" }), ctx());

    expect(changes.inserts).toEqual([
      expect.objectContaining({
        id: "new-1",
        relPath: "S/G/lich.png",
        system: "S",
        group: "G",
        unsorted: false,
        hash: "h1",
        width: 20,
        createdAt: NOW,
      }),
    ]);
    expect(changes.updates).toEqual([]);
  });

  it("keeps id and tags when a file is renamed or moved outside the app", () => {
    const old = art("S/G/lich.png", { hash: "h1", tags: ["босс"], displayName: "Лич" });
    const plan = planScan([old], [file("S/Other/лич-король.png", { mtime: 5 })]);

    const changes = resolveScan(plan, inspect({ "S/Other/лич-король.png": "h1" }), ctx());

    expect(changes.inserts).toEqual([]);
    expect(changes.markMissing).toEqual([]);
    expect(changes.updates).toEqual([
      expect.objectContaining({
        id: old.id,
        relPath: "S/Other/лич-король.png",
        group: "Other",
        fileName: "лич-король.png",
        tags: ["босс"],
        displayName: "Лич",
        mtime: 5,
        updatedAt: NOW,
      }),
    ]);
  });

  it("restores a record that was marked missing when the file reappears elsewhere", () => {
    const old = art("S/G/lich.png", { hash: "h1", missing: true });
    const plan = planScan([old], [file("S/G2/lich.png")]);

    const changes = resolveScan(plan, inspect({ "S/G2/lich.png": "h1" }), ctx());

    expect(changes.updates).toEqual([
      expect.objectContaining({ id: old.id, relPath: "S/G2/lich.png", missing: false }),
    ]);
  });

  it("clears missing when the file is back at the same path", () => {
    const old = art("S/G/lich.png", { missing: true });

    const changes = resolveScan(planScan([old], [file("S/G/lich.png")]), new Map(), ctx());

    expect(changes.updates).toEqual([expect.objectContaining({ id: old.id, missing: false })]);
  });

  it("marks vanished files as missing, but not twice", () => {
    const gone = art("S/G/gone.png");
    const alreadyMissing = art("S/G/old.png", { missing: true });

    const changes = resolveScan(planScan([gone, alreadyMissing], []), new Map(), ctx());

    expect(changes.markMissing).toEqual([gone.id]);
  });

  it("gives a moved record to only one of several identical copies", () => {
    const old = art("S/G/lich.png", { hash: "h1" });
    const plan = planScan([old], [file("S/A/copy.png"), file("S/B/lich.png")]);

    const changes = resolveScan(
      plan,
      inspect({ "S/A/copy.png": "h1", "S/B/lich.png": "h1" }),
      ctx(),
    );

    // The copy with the same file name wins; the other becomes a new record.
    expect(changes.updates).toEqual([
      expect.objectContaining({ id: old.id, relPath: "S/B/lich.png" }),
    ]);
    expect(changes.inserts.map((a) => a.relPath)).toEqual(["S/A/copy.png"]);
  });

  it("updates changed files and keeps the old hash if hashing failed", () => {
    const old = art("S/G/lich.png", { hash: "h1" });
    const plan = planScan([old], [file("S/G/lich.png", { size: 200 })]);

    const changes = resolveScan(plan, inspect({ "S/G/lich.png": null }), ctx());

    expect(changes.updates).toEqual([
      expect.objectContaining({ id: old.id, size: 200, hash: "h1" }),
    ]);
  });

  it("does not match new files without a hash", () => {
    const old = art("S/G/lich.png", { hash: "h1" });
    const plan = planScan([old], [file("S/G/locked.png")]);

    const changes = resolveScan(plan, inspect({ "S/G/locked.png": null }), ctx());

    expect(changes.inserts).toEqual([expect.objectContaining({ hash: null })]);
    expect(changes.markMissing).toEqual([old.id]);
  });
});
