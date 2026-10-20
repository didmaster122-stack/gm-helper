import { create } from "zustand";
import { watchTree } from "../../shared/fs";
import { buildEntry, type SearchEntry } from "./domain/search";
import { buildTree, type LibraryTree } from "./domain/tree";
import type { Art, LibrarySelection } from "./domain/types";
import { syncLibrary } from "./service";

interface LibraryState {
  root: string | null;
  arts: Art[];
  entries: SearchEntry[];
  folders: string[];
  tree: LibraryTree;
  syncing: boolean;
  progress: { done: number; total: number } | null;
  /** Unreadable files/folders from the last sync. */
  syncErrors: string[];
  /** Fatal error of the last sync (e.g. root unavailable). */
  error: string | null;
  selection: LibrarySelection;
  query: string;
  selectedArtId: string | null;

  /** Opens the library at `root` (no-op if already open) and keeps it in sync with the disk. */
  open: (root: string) => Promise<void>;
  sync: () => Promise<void>;
  setSelection: (selection: LibrarySelection) => void;
  setQuery: (query: string) => void;
  selectArt: (id: string | null) => void;
  /** Replaces one art after an app-side change, without a full sync. */
  putArt: (art: Art) => void;
}

const emptyTree = buildTree([], []);

let unwatch: (() => void) | null = null;
let syncRunning: Promise<void> | null = null;
let syncAgain = false;

export const useLibraryStore = create<LibraryState>((set, get) => {
  function setArts(arts: Art[], folders = get().folders) {
    set({ arts, folders, entries: arts.map(buildEntry), tree: buildTree(folders, arts) });
  }

  async function runSync(): Promise<void> {
    const root = get().root;
    if (!root) return;
    set({ syncing: true, progress: null });
    try {
      const result = await syncLibrary(root, (done, total) =>
        set({ progress: total > 0 ? { done, total } : null }),
      );
      // The library may have been switched to another root meanwhile.
      if (get().root !== root) return;
      setArts(result.arts, result.folders);
      set({ syncErrors: result.errors, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ syncing: false, progress: null });
    }
  }

  return {
    root: null,
    arts: [],
    entries: [],
    folders: [],
    tree: emptyTree,
    syncing: false,
    progress: null,
    syncErrors: [],
    error: null,
    selection: { kind: "all" },
    query: "",
    selectedArtId: null,

    async open(root) {
      if (get().root === root) return;
      unwatch?.();
      unwatch = null;
      set({ root, selectedArtId: null, selection: { kind: "all" }, query: "" });
      setArts([], []);
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
      set({ selection, selectedArtId: null });
    },

    setQuery(query) {
      set({ query });
    },

    selectArt(id) {
      set({ selectedArtId: id });
    },

    putArt(art) {
      setArts(get().arts.map((a) => (a.id === art.id ? art : a)));
    },
  };
});

export function useSelectedArt(): Art | null {
  return useLibraryStore((s) => s.arts.find((a) => a.id === s.selectedArtId) ?? null);
}
