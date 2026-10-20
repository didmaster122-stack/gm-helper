import { create } from "zustand";
import { getDb } from "../../shared/db";
import { ru } from "../../shared/i18n/ru";
import { isBuiltinTypeId, type CellType } from "./domain/cellTypes";
import * as repo from "./repo";

interface CellTypeState {
  /** Built-in types (names from i18n) followed by custom ones; empty until loaded. */
  types: CellType[];
  load: () => Promise<void>;
  create: (input: repo.CustomTypeInput) => Promise<void>;
  update: (id: string, input: repo.CustomTypeInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setBuiltinColor: (id: string, color: string | null) => Promise<void>;
}

function withNames(types: CellType[]): CellType[] {
  return types.map((t) => (isBuiltinTypeId(t.id) ? { ...t, name: ru.cellTypes.names[t.id] } : t));
}

/** Cell types are app-wide (shared by all campaigns). */
export const useCellTypeStore = create<CellTypeState>((set) => {
  async function refresh() {
    set({ types: withNames(await repo.listCellTypes(await getDb())) });
  }

  return {
    types: [],
    load: refresh,

    async create(input) {
      await repo.createCustomType(await getDb(), input);
      await refresh();
    },

    async update(id, input) {
      await repo.updateCustomType(await getDb(), id, input);
      await refresh();
    },

    async remove(id) {
      await repo.deleteCustomType(await getDb(), id);
      await refresh();
    },

    async setBuiltinColor(id, color) {
      await repo.setBuiltinColor(await getDb(), id, color);
      await refresh();
    },
  };
});
