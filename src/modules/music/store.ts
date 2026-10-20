import { create } from "zustand";
import { buildCatalogTree, type CatalogTree } from "../../shared/catalog/tree";
import { watchTree } from "../../shared/fs";
import { buildTrackEntry, type TrackEntry } from "./domain/search";
import { selectionOf } from "./domain/tracks";
import type { MusicSelection, Track } from "./domain/types";
import { readMissingDurations } from "./durations";
import { saveDurations, syncMusic } from "./service";

interface MusicState {
  root: string | null;
  tracks: Track[];
  entries: TrackEntry[];
  folders: string[];
  tree: CatalogTree;
  syncing: boolean;
  progress: { done: number; total: number } | null;
  syncErrors: string[];
  error: string | null;
  selection: MusicSelection;
  query: string;
  selectedTrackId: string | null;

  /** Opens the music folder (no-op if already open) and keeps it in sync with the disk. */
  open: (root: string) => Promise<void>;
  sync: () => Promise<void>;
  setSelection: (selection: MusicSelection) => void;
  setQuery: (query: string) => void;
  selectTrack: (id: string | null) => void;
  revealTrack: (id: string) => void;
  /** Replaces one track after an app-side change, without a full sync. */
  putTrack: (track: Track) => void;
}

const treeOf = (folders: readonly string[], tracks: readonly Track[]) =>
  buildCatalogTree(
    folders,
    tracks.map((t) => ({ ...t, top: t.category, sub: t.collection })),
  );

let unwatch: (() => void) | null = null;
let syncRunning: Promise<void> | null = null;
let syncAgain = false;
/** Bumped on every sync and root change: stale duration readers stop. */
let generation = 0;

export const useMusicStore = create<MusicState>((set, get) => {
  function setTracks(tracks: Track[], folders = get().folders) {
    set({ tracks, folders, entries: tracks.map(buildTrackEntry), tree: treeOf(folders, tracks) });
  }

  async function fillDurations(root: string) {
    const mine = ++generation;
    await readMissingDurations(
      root,
      get().tracks,
      async (found) => {
        if (mine !== generation) return;
        await saveDurations(found);
        setTracks(
          get().tracks.map((t) => {
            const ms = found.get(t.id);
            return ms === undefined ? t : { ...t, durationMs: Math.round(ms) };
          }),
        );
      },
      () => mine !== generation || get().root !== root,
    );
  }

  async function runSync(): Promise<void> {
    const root = get().root;
    if (!root) return;
    generation++;
    set({ syncing: true, progress: null });
    try {
      const result = await syncMusic(root, (done, total) =>
        set({ progress: total > 0 ? { done, total } : null }),
      );
      if (get().root !== root) return;
      setTracks(result.tracks, result.folders);
      set({ syncErrors: result.errors, error: null });
      void fillDurations(root);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ syncing: false, progress: null });
    }
  }

  return {
    root: null,
    tracks: [],
    entries: [],
    folders: [],
    tree: treeOf([], []),
    syncing: false,
    progress: null,
    syncErrors: [],
    error: null,
    selection: { kind: "all" },
    query: "",
    selectedTrackId: null,

    async open(root) {
      if (get().root === root) return;
      unwatch?.();
      unwatch = null;
      generation++;
      set({ root, selectedTrackId: null, selection: { kind: "all" }, query: "" });
      setTracks([], []);
      await get().sync();
      try {
        const stop = await watchTree(root, () => void get().sync());
        if (get().root === root) unwatch = stop;
        else stop();
      } catch {
        // Watching is a convenience; manual refresh still works.
      }
    },

    /** Serialised: a request during a running sync schedules exactly one more. */
    async sync() {
      if (syncRunning) {
        syncAgain = true;
        return syncRunning;
      }
      syncRunning = (async () => {
        do {
          syncAgain = false;
          await runSync();
        } while (syncAgain);
      })().finally(() => {
        syncRunning = null;
      });
      return syncRunning;
    },

    setSelection(selection) {
      set({ selection, selectedTrackId: null });
    },

    setQuery(query) {
      set({ query });
    },

    selectTrack(id) {
      set({ selectedTrackId: id });
    },

    revealTrack(id) {
      const track = get().tracks.find((t) => t.id === id);
      if (track) set({ selection: selectionOf(track), query: "", selectedTrackId: id });
    },

    putTrack(track) {
      setTracks(get().tracks.map((t) => (t.id === track.id ? track : t)));
    },
  };
});

export function useSelectedTrack(): Track | null {
  return useMusicStore((s) => s.tracks.find((t) => t.id === s.selectedTrackId) ?? null);
}
