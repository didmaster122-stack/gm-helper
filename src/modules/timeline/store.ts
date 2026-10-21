import { create } from "zustand";
import { getDb } from "../../shared/db";
import { initHistory, pushHistory, redo, undo, type History } from "../../shared/history";
import { ru } from "../../shared/i18n/ru";
import { noFilter, type TimelineFilter } from "./domain/filter";
import { ensureDefaults, type IdSource } from "./domain/timeline";
import { emptyTimeline, type Timeline } from "./domain/types";
import * as repo from "./repo";

export type TimelineSelection = { kind: "event" | "link" | "marker"; id: string } | null;

type Status = "idle" | "loading" | "ready" | "error";

interface TimelineState {
  campaignId: string | null;
  status: Status;
  history: History<Timeline>;
  selection: TimelineSelection;
  /** Event to centre the view on once the timeline is shown. */
  focusId: string | null;
  filter: TimelineFilter;
  /** Last failed save; the timeline was reloaded from the database after it. */
  saveError: string | null;
  /** Loads the campaign's timeline (no-op if it is already loaded unless `force`). */
  load: (campaignId: string, force?: boolean) => Promise<void>;
  /** Applies an edit as one undo step and saves it. */
  edit: (change: (timeline: Timeline, src: IdSource) => Timeline) => void;
  undo: () => void;
  redo: () => void;
  select: (selection: TimelineSelection) => void;
  setFocus: (id: string | null) => void;
  setFilter: (filter: TimelineFilter) => void;
  clearSaveError: () => void;
}

/** Saves run one after another, in the order of the edits. */
let saving: Promise<void> = Promise.resolve();

/** An event to show once its campaign is loaded (see `showEvent`). */
let requested: { campaignId: string; id: string } | null = null;

function shown(id: string) {
  return { selection: { kind: "event" as const, id }, focusId: id };
}

function idSource(campaignId: string): IdSource {
  return { campaignId, now: new Date().toISOString(), newId: () => crypto.randomUUID() };
}

export const useTimelineStore = create<TimelineState>((set, get) => {
  function persist(prev: Timeline, next: Timeline) {
    const campaignId = get().campaignId;
    if (!campaignId) return;
    saving = saving.then(async () => {
      try {
        await repo.saveTimelineChange(await getDb(), campaignId, prev, next);
      } catch (error) {
        console.error("Failed to save timeline", error);
        set({ saveError: error instanceof Error ? error.message : String(error) });
        // Show what is really stored rather than an edit that was lost.
        if (get().campaignId === campaignId) await get().load(campaignId, true);
      }
    });
  }

  function move(history: History<Timeline>) {
    const prev = get().history.present;
    set({ history });
    persist(prev, history.present);
  }

  return {
    campaignId: null,
    status: "idle",
    history: initHistory(emptyTimeline),
    selection: null,
    focusId: null,
    filter: noFilter,
    saveError: null,

    async load(campaignId, force = false) {
      const state = get();
      if (!force && state.campaignId === campaignId && state.status !== "error") return;
      if (state.campaignId !== campaignId) {
        set({
          campaignId,
          history: initHistory(emptyTimeline),
          selection: null,
          focusId: null,
          filter: noFilter,
        });
      }
      set({ status: "loading" });
      try {
        await saving;
        const db = await getDb();
        const stored = await repo.loadTimeline(db, campaignId);
        const timeline = ensureDefaults(stored, ru.timeline.sideLane, idSource(campaignId));
        if (timeline !== stored) await repo.saveTimelineChange(db, campaignId, stored, timeline);
        if (get().campaignId !== campaignId) return;
        set({ history: initHistory(timeline), status: "ready" });
        if (requested?.campaignId === campaignId) {
          set(shown(requested.id));
          requested = null;
        }
      } catch (error) {
        console.error("Failed to load timeline", error);
        if (get().campaignId === campaignId) set({ status: "error" });
      }
    },

    edit(change) {
      const { history, status, campaignId } = get();
      if (status !== "ready" || !campaignId) return;
      const next = change(history.present, idSource(campaignId));
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
    clearSaveError: () => set({ saveError: null }),
  };
});

export function useTimeline(): Timeline {
  return useTimelineStore((s) => s.history.present);
}

/**
 * Selects an event and centres the view on it when it is shown next. An event of a campaign
 * that is not loaded yet is selected after loading.
 */
export function showEvent(campaignId: string, id: string): void {
  if (useTimelineStore.getState().campaignId === campaignId) {
    requested = null;
    useTimelineStore.setState(shown(id));
  } else {
    requested = { campaignId, id };
  }
}
