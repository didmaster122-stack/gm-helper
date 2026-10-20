import { create } from "zustand";
import { getDb } from "../../shared/db";
import { decodeSymbol, symbolImage } from "./domain/cellTypes";
import type { GmmapObject } from "./domain/gmmapFile";
import type { ObjectDef } from "./domain/objects";
import { loadImages } from "./imageCache";
import * as repo from "./repo";

interface ObjectState {
  loaded: boolean;
  /** Catalog objects by name. */
  defs: ObjectDef[];
  load: () => Promise<void>;
  /** Returns the id of the new object. */
  create: (input: repo.ObjectDefInput) => Promise<string>;
  update: (id: string, input: repo.ObjectDefInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Adds catalog objects from an imported map that this PC does not have yet (matched by id). */
  importMissing: (objects: readonly GmmapObject[]) => Promise<void>;
}

/** The object catalog is app-wide (shared by all campaigns), like cell types. */
export const useObjectStore = create<ObjectState>((set, get) => {
  async function refresh() {
    const defs = await repo.listObjectDefs(await getDb());
    await loadImages(defs.map((d) => symbolImage(d.symbol)));
    set({ defs, loaded: true });
  }

  return {
    loaded: false,
    defs: [],
    load: refresh,

    async create(input) {
      const id = await repo.createObjectDef(await getDb(), input);
      await refresh();
      return id;
    },

    async update(id, input) {
      await repo.updateObjectDef(await getDb(), id, input);
      await refresh();
    },

    async remove(id) {
      await repo.deleteObjectDef(await getDb(), id);
      await refresh();
    },

    async importMissing(objects) {
      if (!get().loaded) await refresh();
      const known = new Set(get().defs.map((d) => d.id));
      const missing = objects.filter((d) => !known.has(d.id));
      if (missing.length === 0) return;
      const db = await getDb();
      for (const d of missing) {
        const input = {
          name: d.name,
          width: d.width,
          height: d.height,
          color: d.color,
          symbol: decodeSymbol(d.symbol, d.image),
          blocksMove: d.blocksMove,
          blocksSight: d.blocksSight,
        };
        await repo.createObjectDef(db, input, undefined, d.id);
      }
      await refresh();
    },
  };
});
