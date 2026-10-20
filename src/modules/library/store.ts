import { create } from "zustand";
import { watchTree } from "../../shared/fs";
import { buildEntry, type SearchEntry, type TokenFilter } from "./domain/search";
import { buildTree, type LibraryTree } from "./domain/tree";
import type { Art, LibrarySelection, Token } from "./domain/types";
import { syncLibrary } from "./service";

interface LibraryState {
  root: string | null;
  arts: Art[];
  tokens: Token[];
  /** Tokens grouped by art id, in creation order. */
  tokensByArt: ReadonlyMap<string, Token[]>;
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
  tokenFilter: TokenFilter;
  selectedArtId: string | null;

  /** Opens the library at `root` (no-op if already open) and keeps it in sync with the disk. */
  open: (root: string) => Promise<void>;
  sync: () => Promise<void>;
  setSelection: (selection: LibrarySelection) => void;
  setQuery: (query: string) => void;
  setTokenFilter: (filter: TokenFilter) => void;
  selectArt: (id: string | null) => void;
  /** Shows the art in the grid: opens its folder, clears the search and selects it. */
  revealArt: (id: string) => void;
  /** Replaces one art after an app-side change, without a full sync. */
  putArt: (art: Art) => void;
  /** Adds or replaces tokens after an app-side change. */
  putTokens: (tokens: readonly Token[]) => void;
  removeToken: (id: string) => void;
}

const emptyTree = buildTree([], []);

function groupTokens(tokens: readonly Token[]): Map<string, Token[]> {
  const map = new Map<string, Token[]>();
  for (const t of tokens) {
    const list = map.get(t.artId);
    if (list) list.push(t);
    else map.set(t.artId, [t]);
  }
  return map;
}

function selectionOf(art: Art): LibrarySelection {
  if (art.missing) return { kind: "missing" };
  if (art.unsorted) return { kind: "unsorted" };
  return { kind: "group", system: art.system ?? "", group: art.group ?? "" };
}

let unwatch: (() => void) | null = null;
let syncRunning: Promise<void> | null = null;
let syncAgain = false;

export const useLibraryStore = create<LibraryState>((set, get) => {
  function setArts(arts: Art[], folders = get().folders) {
    set({ arts, folders, entries: arts.map(buildEntry), tree: buildTree(folders, arts) });
  }

  function setTokens(tokens: Token[]) {
    set({ tokens, tokensByArt: groupTokens(tokens) });
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
      setTokens(result.tokens);
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
    tokens: [],
    tokensByArt: new Map(),
    entries: [],
    folders: [],
    tree: emptyTree,
    syncing: false,
    progress: null,
    syncErrors: [],
    error: null,
    selection: { kind: "all" },
    query: "",
    tokenFilter: "any",
    selectedArtId: null,

    async open(root) {
      if (get().root === root) return;
      unwatch?.();
      unwatch = null;
      set({ root, selectedArtId: null, selection: { kind: "all" }, query: "", tokenFilter: "any" });
      setArts([], []);
      setTokens([]);
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

    setTokenFilter(tokenFilter) {
      set({ tokenFilter });
    },

    selectArt(id) {
      set({ selectedArtId: id });
    },

    revealArt(id) {
      const art = get().arts.find((a) => a.id === id);
      if (!art) return;
      set({ selection: selectionOf(art), query: "", tokenFilter: "any", selectedArtId: id });
    },

    putArt(art) {
      setArts(get().arts.map((a) => (a.id === art.id ? art : a)));
    },

    putTokens(tokens) {
      const changed = new Map(tokens.map((t) => [t.id, t]));
      const kept = get().tokens.map((t) => changed.get(t.id) ?? t);
      const known = new Set(kept.map((t) => t.id));
      setTokens([...kept, ...tokens.filter((t) => !known.has(t.id))]);
    },

    removeToken(id) {
      setTokens(get().tokens.filter((t) => t.id !== id));
    },
  };
});

export function useSelectedArt(): Art | null {
  return useLibraryStore((s) => s.arts.find((a) => a.id === s.selectedArtId) ?? null);
}

const NO_TOKENS: Token[] = [];

export function useArtTokens(artId: string): Token[] {
  return useLibraryStore((s) => s.tokensByArt.get(artId) ?? NO_TOKENS);
}
