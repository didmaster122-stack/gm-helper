import { toAbsolute } from "../../shared/catalog/paths";
import { fileUrl } from "../../shared/fs";
import type { Track } from "./domain/types";

const PROBE_TIMEOUT_MS = 15_000;
const PARALLEL = 3;
const SAVE_EVERY = 10;

/** Length of an audio file in ms, read from its metadata by the webview; null if unknown. */
export function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const finish = (ms: number | null) => {
      clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      resolve(ms);
    };
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    audio.addEventListener("loadedmetadata", () =>
      finish(Number.isFinite(audio.duration) ? audio.duration * 1000 : null),
    );
    audio.addEventListener("error", () => finish(null));
    audio.src = url;
  });
}

/**
 * Reads lengths of tracks that have none yet, a few files at a time.
 * `onBatch` receives found lengths every few files; `cancelled` stops the work early.
 */
export async function readMissingDurations(
  root: string,
  tracks: readonly Track[],
  onBatch: (durations: Map<string, number>) => Promise<void>,
  cancelled: () => boolean,
): Promise<void> {
  const queue = tracks.filter((t) => t.durationMs === null && !t.missing);
  let pending = new Map<string, number>();
  let found = 0;

  async function worker() {
    for (let track = queue.shift(); track; track = queue.shift()) {
      if (cancelled()) return;
      const ms = await probeDuration(fileUrl(toAbsolute(root, track.relPath)));
      if (ms === null) continue;
      pending.set(track.id, ms);
      if (++found % SAVE_EVERY === 0) {
        const batch = pending;
        pending = new Map();
        await onBatch(batch);
      }
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, worker));
  if (pending.size > 0 && !cancelled()) await onBatch(pending);
}
