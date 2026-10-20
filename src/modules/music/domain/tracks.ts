// Track records: names, locations and the catalog sync adapter.
import { hasExtension, locate, splitExtension } from "../../../shared/catalog/paths";
import * as catalog from "../../../shared/catalog/reconcile";
import type { FoundFile, ResolveContext } from "../../../shared/catalog/reconcile";
import type { MusicSelection, Track, TrackInspection } from "./types";

/** Formats WebView2 plays (spec §6.1). */
export const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".oga", ".wav", ".flac", ".m4a"] as const;

export function isSupportedAudio(fileName: string): boolean {
  return hasExtension(fileName, AUDIO_EXTENSIONS);
}

export function trackName(track: Pick<Track, "displayName" | "fileName">): string {
  return track.displayName?.trim() || splitExtension(track.fileName).base;
}

export function trackLocation(relPath: string) {
  const { top, sub, unsorted, fileName } = locate(relPath);
  return { category: top, collection: sub, unsorted, fileName };
}

/** Copy of the track at a new relative path, with location fields recomputed. */
export function relocateTrack(track: Track, relPath: string, now: string): Track {
  return { ...track, ...trackLocation(relPath), relPath, updatedAt: now };
}

const adapter: catalog.ReconcileAdapter<Track, TrackInspection> = {
  update(track, file, info, now) {
    // Another file content means another length.
    const sameContent = !info?.hash || info.hash === track.hash;
    return {
      ...relocateTrack(track, file.relPath, now),
      size: file.size,
      mtime: file.mtime,
      hash: info?.hash ?? track.hash,
      durationMs: sameContent ? track.durationMs : null,
      missing: false,
    };
  },
  create(file, info, ctx) {
    return {
      id: ctx.newId(),
      ...trackLocation(file.relPath),
      relPath: file.relPath,
      size: file.size,
      mtime: file.mtime,
      hash: info?.hash ?? null,
      durationMs: null,
      displayName: null,
      tags: [],
      missing: false,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
  },
};

export function planTrackScan(existing: readonly Track[], found: readonly FoundFile[]) {
  return catalog.planScan(existing, found);
}

export function resolveTrackScan(
  plan: catalog.ScanPlan<Track>,
  inspected: ReadonlyMap<string, TrackInspection>,
  ctx: ResolveContext,
): catalog.ScanChanges<Track> {
  return catalog.resolveScan(plan, inspected, ctx, adapter);
}

export function matchesSelection(track: Track, selection: MusicSelection): boolean {
  switch (selection.kind) {
    case "missing":
      return track.missing;
    case "all":
      return !track.missing;
    case "unsorted":
      return !track.missing && track.unsorted;
    case "category":
      return !track.missing && track.category === selection.category;
    case "collection":
      return (
        !track.missing &&
        !track.unsorted &&
        track.category === selection.category &&
        track.collection === selection.collection
      );
  }
}

export function selectionOf(track: Track): MusicSelection {
  if (track.missing) return { kind: "missing" };
  if (track.unsorted) return { kind: "unsorted" };
  return { kind: "collection", category: track.category ?? "", collection: track.collection ?? "" };
}

/** "3:07", "1:02:05"; an unknown length is "—". */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
