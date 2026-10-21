import { create } from "zustand";
import { getDb } from "../../shared/db";
import { useCellTypeStore } from "./cellTypeStore";
import { FLOOR, makeTypeLookup, WALL } from "./domain/cellTypes";
import type { BattlemapModel } from "./domain/grid";
import {
  initHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from "../../shared/history";
import { nextRotation, type Rotation } from "./domain/objects";
import { useObjectStore } from "./objectStore";
import { renderPreview } from "./preview";
import * as repo from "./repo";

// ---- Map gallery ----

export type GalleryTab = "maps" | "templates";

interface MapListState {
  campaignId: string | null;
  maps: repo.BattlemapSummary[];
  templates: repo.BattlemapSummary[];
  tab: GalleryTab;
  setTab: (tab: GalleryTab) => void;
  load: (campaignId: string) => Promise<void>;
  create: (
    campaignId: string,
    info: repo.MapInfo,
    model: BattlemapModel,
  ) => Promise<repo.BattlemapSummary>;
  /** Copies a map into the template library. */
  saveAsTemplate: (mapId: string) => Promise<repo.BattlemapSummary>;
  /** Copies a template into the campaign under the given name, description and tags. */
  createFromTemplate: (
    templateId: string,
    campaignId: string,
    info: repo.MapInfo,
  ) => Promise<repo.BattlemapSummary>;
  updateInfo: (id: string, info: repo.MapInfo) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useMapListStore = create<MapListState>((set, get) => {
  async function refresh() {
    const db = await getDb();
    const campaignId = get().campaignId;
    const [maps, templates] = await Promise.all([
      campaignId ? repo.listMaps(db, campaignId) : Promise.resolve([]),
      repo.listTemplates(db),
    ]);
    // The campaign may have been switched while loading.
    if (get().campaignId === campaignId) set({ maps, templates });
  }

  return {
    campaignId: null,
    maps: [],
    templates: [],
    tab: "maps",
    setTab: (tab) => set({ tab }),

    async load(campaignId) {
      if (campaignId !== get().campaignId) set({ campaignId, maps: [] });
      await refresh();
    },

    async create(campaignId, info, model) {
      const created = await repo.createMap(await getDb(), campaignId, info, model);
      await refresh();
      return created;
    },

    async saveAsTemplate(mapId) {
      // The open map may have unsaved edits.
      if (useEditorStore.getState().map?.id === mapId) await useEditorStore.getState().flush();
      const created = await repo.copyMap(await getDb(), mapId, null);
      await refresh();
      return created;
    },

    async createFromTemplate(templateId, campaignId, info) {
      if (useEditorStore.getState().map?.id === templateId) {
        await useEditorStore.getState().flush();
      }
      const created = await repo.copyMap(await getDb(), templateId, campaignId, info);
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

export type Tool = "pointer" | "brush" | "rect" | "fill" | "eraser" | "select" | "object";
export type SaveState = "saved" | "pending" | "saving" | "error";

const SAVE_DELAY_MS = 600;
const NO_OBJECTS: ReadonlySet<string> = new Set();

interface EditorState {
  map: repo.BattlemapSummary | null;
  history: History<BattlemapModel> | null;
  selection: ReadonlySet<number>;
  /** Ids of selected placed objects. */
  selectedObjects: ReadonlySet<string>;
  regionId: string | null;
  tool: Tool;
  typeId: string;
  /** Catalog object placed by the "Object" tool. */
  objectDefId: string | null;
  /** Rotation of the object about to be placed (R). */
  placeRotation: Rotation;
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
  setSelectedObjects: (ids: ReadonlySet<string>) => void;
  setRegion: (id: string | null) => void;
  setTool: (tool: Tool) => void;
  setType: (typeId: string) => void;
  /** Picks a catalog object and switches to the "Object" tool. */
  setObjectDef: (id: string) => void;
  rotatePlacement: () => void;
  flush: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Model that was last written (or loaded), to skip saving when undo returns to it. */
let savedModel: BattlemapModel | null = null;

function previewOf(model: BattlemapModel): string | null {
  const types = useCellTypeStore.getState().types;
  if (types.length === 0) return null;
  const defs = new Map(useObjectStore.getState().defs.map((d) => [d.id, d]));
  try {
    return renderPreview(model, makeTypeLookup(types), (id) => defs.get(id));
  } catch (error) {
    // The map itself must still be saved.
    console.error("Failed to render map preview", error);
    return null;
  }
}

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
      await repo.saveMapModel(await getDb(), map.id, model, previewOf(model));
      savedModel = model;
      // Another edit may have come in while saving.
      if (get().history?.present === model) set({ saveState: "saved" });
    } catch (error) {
      console.error("Failed to save battlemap", error);
      set({ saveState: "error" });
    }
  }

  function schedule(history: History<BattlemapModel>) {
    const present = history.present;
    const visible = present.cells.length;
    const { selection, selectedObjects, regionId } = get();
    const cells = [...selection].filter((c) => c < visible);
    const objects = [...selectedObjects].filter((id) => present.objects.some((o) => o.id === id));
    set({
      history,
      saveState: "pending",
      regionId: present.regions.some((r) => r.id === regionId) ? regionId : null,
      selection: cells.length === selection.size ? selection : new Set(cells),
      selectedObjects: objects.length === selectedObjects.size ? selectedObjects : new Set(objects),
    });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  return {
    map: null,
    history: null,
    selection: new Set(),
    selectedObjects: NO_OBJECTS,
    regionId: null,
    tool: "brush",
    typeId: WALL,
    objectDefId: null,
    placeRotation: 0,
    saveState: "saved",

    open(map) {
      clearTimeout(saveTimer);
      const { model, ...summary } = map;
      // Maps saved before previews existed get one on the first save.
      savedModel = summary.preview === "" ? null : model;
      set({
        map: summary,
        history: initHistory(model),
        selection: new Set(),
        selectedObjects: NO_OBJECTS,
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
      set({
        map: null,
        history: null,
        selection: new Set(),
        selectedObjects: NO_OBJECTS,
        regionId: null,
      });
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
    setSelectedObjects: (selectedObjects) => set({ selectedObjects }),
    setRegion: (regionId) => set({ regionId }),
    setTool: (tool) => set({ tool }),
    setType: (typeId) => set({ typeId: typeId || FLOOR }),
    setObjectDef: (objectDefId) => set({ objectDefId, tool: "object" }),
    rotatePlacement: () => set({ placeRotation: nextRotation(get().placeRotation) }),
    flush: save,
  };
});

/** Opens the map in the battlemap section (it is shown when its campaign is the active one). */
export function showMap(id: string): Promise<void> {
  return useEditorStore.getState().openById(id);
}
