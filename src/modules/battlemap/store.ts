import { create } from "zustand";
import { getDb } from "../../shared/db";
import { FLOOR, WALL } from "./domain/cellTypes";
import type { BattlemapModel } from "./domain/grid";
import {
  initHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from "./domain/history";
import * as repo from "./repo";

// ---- Map list ----

interface MapListState {
  campaignId: string | null;
  maps: repo.BattlemapSummary[];
  load: (campaignId: string) => Promise<void>;
  create: (
    campaignId: string,
    info: repo.MapInfo,
    model: BattlemapModel,
  ) => Promise<repo.BattlemapSummary>;
  updateInfo: (id: string, info: repo.MapInfo) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useMapListStore = create<MapListState>((set, get) => {
  async function refresh() {
    const campaignId = get().campaignId;
    if (campaignId) set({ maps: await repo.listMaps(await getDb(), campaignId) });
  }

  return {
    campaignId: null,
    maps: [],

    async load(campaignId) {
      if (campaignId !== get().campaignId) set({ campaignId, maps: [] });
      await refresh();
    },

    async create(campaignId, info, model) {
      const created = await repo.createMap(await getDb(), campaignId, info, model);
      await refresh();
      return created;
    },

    async updateInfo(id, info) {
      await repo.updateMapInfo(await getDb(), id, info);
      await refresh();
      const open = useEditorStore.getState().map;
      if (open?.id === id) useEditorStore.setState({ map: { ...open, ...info } });
    },

    async remove(id) {
      await repo.deleteMap(await getDb(), id);
      await refresh();
    },
  };
});

// ---- Editor ----

export type Tool = "brush" | "rect" | "fill" | "eraser" | "select";
export type SaveState = "saved" | "pending" | "saving" | "error";

const SAVE_DELAY_MS = 600;

interface EditorState {
  map: repo.BattlemapSummary | null;
  history: History<BattlemapModel> | null;
  selection: ReadonlySet<number>;
  regionId: string | null;
  tool: Tool;
  typeId: string;
  saveState: SaveState;
  open: (map: repo.Battlemap) => void;
  /** Loads the map from the database and opens it. */
  openById: (id: string) => Promise<void>;
  /** Saves pending changes and closes the editor. */
  close: () => Promise<void>;
  /** Records an edit as a new undo step. */
  commit: (next: BattlemapModel) => void;
  /** Updates the current undo step (continuing a drag). */
  replace: (next: BattlemapModel) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (cells: ReadonlySet<number>) => void;
  setRegion: (id: string | null) => void;
  setTool: (tool: Tool) => void;
  setType: (typeId: string) => void;
  flush: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Model that was last written (or loaded), to skip saving when undo returns to it. */
let savedModel: BattlemapModel | null = null;

export const useEditorStore = create<EditorState>((set, get) => {
  async function save() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const { map, history } = get();
    if (!map || !history) return;
    const model = history.present;
    if (model === savedModel) {
      set({ saveState: "saved" });
      return;
    }
    set({ saveState: "saving" });
    try {
      await repo.saveMapModel(await getDb(), map.id, model);
      savedModel = model;
      // Another edit may have come in while saving.
      if (get().history?.present === model) set({ saveState: "saved" });
    } catch (error) {
      console.error("Failed to save battlemap", error);
      set({ saveState: "error" });
    }
  }

  function schedule(history: History<BattlemapModel>) {
    const visible = history.present.cells.length;
    const selection = [...get().selection].filter((c) => c < visible);
    const regionId = history.present.regions.some((r) => r.id === get().regionId)
      ? get().regionId
      : null;
    set({
      history,
      saveState: "pending",
      regionId,
      selection: selection.length === get().selection.size ? get().selection : new Set(selection),
    });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  return {
    map: null,
    history: null,
    selection: new Set(),
    regionId: null,
    tool: "brush",
    typeId: WALL,
    saveState: "saved",

    open(map) {
      clearTimeout(saveTimer);
      savedModel = map.model;
      const { model, ...summary } = map;
      set({
        map: summary,
        history: initHistory(model),
        selection: new Set(),
        regionId: null,
        saveState: "saved",
      });
    },

    async openById(id) {
      await get().close();
      const map = await repo.getMap(await getDb(), id);
      if (!map) throw new Error(`Battlemap ${id} not found`);
      get().open(map);
    },

    async close() {
      await save();
      savedModel = null;
      set({ map: null, history: null, selection: new Set(), regionId: null });
    },

    commit(next) {
      const h = get().history;
      if (h && next !== h.present) schedule(pushHistory(h, next));
    },

    replace(next) {
      const h = get().history;
      if (h && next !== h.present) schedule(replacePresent(h, next));
    },

    undo() {
      const h = get().history;
      if (h && h.past.length > 0) schedule(undo(h));
    },

    redo() {
      const h = get().history;
      if (h && h.future.length > 0) schedule(redo(h));
    },

    setSelection: (selection) => set({ selection }),
    setRegion: (regionId) => set({ regionId }),
    setTool: (tool) => set({ tool }),
    setType: (typeId) => set({ typeId: typeId || FLOOR }),
    flush: save,
  };
});
