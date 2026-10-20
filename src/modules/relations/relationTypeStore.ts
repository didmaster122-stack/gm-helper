import { create } from "zustand";
import { getDb } from "../../shared/db";
import { ru } from "../../shared/i18n/ru";
import { isBuiltinRelationType, UNKNOWN_TYPE, type RelationType } from "./domain/types";
import * as repo from "./repo";

interface RelationTypeState {
  /** In display order; built-in names come from i18n unless renamed. Empty until loaded. */
  types: RelationType[];
  load: () => Promise<void>;
  /** Returns the id of the new type. */
  create: (input: repo.RelationTypeInput) => Promise<string>;
  update: (id: string, input: repo.RelationTypeInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function withNames(types: RelationType[]): RelationType[] {
  return types.map((t) =>
    isBuiltinRelationType(t.id) && t.name === ""
      ? { ...t, name: ru.relations.types.names[t.id] }
      : t,
  );
}

/** Relation types are app-wide (shared by all campaigns). */
export const useRelationTypeStore = create<RelationTypeState>((set) => {
  async function refresh() {
    set({ types: withNames(await repo.listRelationTypes(await getDb())) });
  }

  return {
    types: [],
    load: refresh,

    async create(input) {
      const id = await repo.createRelationType(await getDb(), input);
      await refresh();
      return id;
    },

    async update(id, input) {
      // A built-in type renamed back to its default name keeps following i18n.
      const name =
        isBuiltinRelationType(id) && input.name.trim() === ru.relations.types.names[id]
          ? ""
          : input.name;
      await repo.updateRelationType(await getDb(), id, { ...input, name });
      await refresh();
    },

    async remove(id) {
      await repo.deleteRelationType(await getDb(), id);
      await refresh();
    },
  };
});

/** Type of a relation; relations of a deleted type are shown as "unknown". */
export function typeLookup(types: readonly RelationType[]): (id: string) => RelationType {
  const map = new Map(types.map((t) => [t.id, t]));
  const fallback: RelationType = map.get(UNKNOWN_TYPE) ?? {
    id: UNKNOWN_TYPE,
    builtin: true,
    name: ru.relations.types.names.unknown,
    color: "#8a8c99",
    lineStyle: "dashed",
  };
  return (id) => map.get(id) ?? fallback;
}
