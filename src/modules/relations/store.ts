import { create } from "zustand";
import { getDb } from "../../shared/db";
import { initHistory, pushHistory, redo, undo, type History } from "../../shared/history";
import { noFilter, type GraphFilter } from "./domain/filter";
import { freeSpot } from "./domain/geometry";
import { addCharacter } from "./domain/graph";
import { syncFactionPositions } from "./domain/layout";
import { emptyGraph, type Character, type RelationGraph } from "./domain/types";
import * as repo from "./repo";

export type GraphSelection = { kind: "character" | "faction" | "relation"; id: string } | null;

type Status = "idle" | "loading" | "ready" | "error";

interface RelationsState {
  campaignId: string | null;
  status: Status;
  history: History<RelationGraph>;
  selection: GraphSelection;
  /** Node to centre the view on once the graph is shown. */
  focusId: string | null;
  filter: GraphFilter;
  /** Type chosen for the last new relation, offered for the next one. */
  lastTypeId: string;
  /** Last failed save; the graph was reloaded from the database after it. */
  saveError: string | null;
  /** Loads the campaign's graph (no-op if it is already loaded unless `force`). */
  load: (campaignId: string, force?: boolean) => Promise<void>;
  /** Applies an edit as one undo step and saves it. `now` is the edit time (ISO). */
  edit: (change: (graph: RelationGraph, now: string) => RelationGraph) => void;
  undo: () => void;
  redo: () => void;
  select: (selection: GraphSelection) => void;
  setFocus: (id: string | null) => void;
  setFilter: (filter: GraphFilter) => void;
  setLastTypeId: (id: string) => void;
  clearSaveError: () => void;
}

/** Saves run one after another, in the order of the edits. */
let saving: Promise<void> = Promise.resolve();

export const useRelationsStore = create<RelationsState>((set, get) => {
  function persist(prev: RelationGraph, next: RelationGraph) {
    const campaignId = get().campaignId;
    saving = saving.then(async () => {
      try {
        await repo.saveGraphChange(await getDb(), prev, next);
      } catch (error) {
        console.error("Failed to save relation graph", error);
        set({ saveError: error instanceof Error ? error.message : String(error) });
        // Show what is really stored rather than an edit that was lost.
        if (campaignId && get().campaignId === campaignId) await get().load(campaignId, true);
      }
    });
  }

  function move(history: History<RelationGraph>) {
    const prev = get().history.present;
    set({ history });
    persist(prev, history.present);
  }

  return {
    campaignId: null,
    status: "idle",
    history: initHistory(emptyGraph),
    selection: null,
    focusId: null,
    filter: noFilter,
    lastTypeId: "alliance",
    saveError: null,

    async load(campaignId, force = false) {
      const state = get();
      if (!force && state.campaignId === campaignId && state.status !== "error") return;
      if (state.campaignId !== campaignId) {
        set({
          campaignId,
          history: initHistory(emptyGraph),
          selection: null,
          focusId: null,
          filter: noFilter,
        });
      }
      set({ status: "loading" });
      try {
        await saving;
        const graph = await repo.loadGraph(await getDb(), campaignId);
        if (get().campaignId === campaignId) set({ history: initHistory(graph), status: "ready" });
      } catch (error) {
        console.error("Failed to load relation graph", error);
        if (get().campaignId === campaignId) set({ status: "error" });
      }
    },

    edit(change) {
      const { history, status } = get();
      if (status !== "ready") return;
      const now = new Date().toISOString();
      const next = syncFactionPositions(change(history.present, now), now);
      if (next !== history.present) move(pushHistory(history, next));
    },

    undo() {
      const h = get().history;
      if (h.past.length > 0) move(undo(h));
    },

    redo() {
      const h = get().history;
      if (h.future.length > 0) move(redo(h));
    },

    select: (selection) => set({ selection }),
    setFocus: (focusId) => set({ focusId }),
    setFilter: (filter) => set({ filter }),
    setLastTypeId: (lastTypeId) => set({ lastTypeId }),
    clearSaveError: () => set({ saveError: null }),
  };
});

export function useGraph(): RelationGraph {
  return useRelationsStore((s) => s.history.present);
}

export interface NewCharacter {
  name: string;
  kind: Character["kind"];
  player?: string;
  artId?: string | null;
  tokenId?: string | null;
  /** Top-left position; a free spot under the graph when omitted. */
  position?: { x: number; y: number };
}

/** Adds a character to the campaign's graph (one undo step), selects it and returns its id. */
export async function createCharacter(campaignId: string, input: NewCharacter): Promise<string> {
  const store = useRelationsStore.getState();
  await store.load(campaignId);
  const id = crypto.randomUUID();
  store.edit((graph, now) => {
    const position = input.position ?? freeSpot(graph.characters, graph.factions);
    return addCharacter(graph, {
      id,
      campaignId,
      name: input.name.trim(),
      kind: input.kind,
      player: input.player?.trim() ?? "",
      role: "",
      status: "alive",
      description: "",
      motivation: "",
      secrets: "",
      tags: [],
      factionIds: [],
      artId: input.artId ?? null,
      tokenId: input.tokenId ?? null,
      x: Math.round(position.x),
      y: Math.round(position.y),
      createdAt: now,
      updatedAt: now,
    });
  });
  useRelationsStore.setState({ selection: { kind: "character", id }, focusId: id });
  return id;
}
