import { create } from "zustand";
import { getDb, getSetting, setSetting } from "../shared/db";
import { pathExists } from "../shared/fs";
import { useCampaignStore } from "../modules/campaigns";

export type ModuleId =
  "library" | "battlemaps" | "relations" | "timeline" | "notes" | "music" | "settings";

type Status = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };

interface AppState {
  status: Status;
  libraryRoot: string | null;
  /** The saved library folder no longer exists (moved, unplugged drive). */
  libraryRootMissing: boolean;
  /** Optional folder of the music section. */
  musicRoot: string | null;
  musicRootMissing: boolean;
  module: ModuleId;
  init: () => Promise<void>;
  setLibraryRoot: (path: string) => Promise<void>;
  setMusicRoot: (path: string) => Promise<void>;
  setModule: (module: ModuleId) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useAppStore = create<AppState>((set) => ({
  status: { kind: "loading" },
  libraryRoot: null,
  libraryRootMissing: false,
  musicRoot: null,
  musicRootMissing: false,
  module: "library",

  async init() {
    set({ status: { kind: "loading" } });
    try {
      const db = await getDb();
      const libraryRoot = await getSetting(db, "libraryRoot");
      const libraryRootMissing = libraryRoot !== null && !(await pathExists(libraryRoot));
      const musicRoot = await getSetting(db, "musicRoot");
      const musicRootMissing = musicRoot !== null && !(await pathExists(musicRoot));
      await useCampaignStore.getState().load();
      set({
        libraryRoot,
        libraryRootMissing,
        musicRoot,
        musicRootMissing,
        status: { kind: "ready" },
      });
    } catch (error) {
      set({ status: { kind: "error", message: errorMessage(error) } });
    }
  },

  async setLibraryRoot(path) {
    await setSetting(await getDb(), "libraryRoot", path);
    set({ libraryRoot: path, libraryRootMissing: false });
  },

  async setMusicRoot(path) {
    await setSetting(await getDb(), "musicRoot", path);
    set({ musicRoot: path, musicRootMissing: false });
  },

  setModule(module) {
    set({ module });
  },
}));
