import { create } from "zustand";
import { getDb, getSetting, setSetting } from "../../shared/db";
import { resolveActiveCampaignId } from "./active";
import * as repo from "./repo";
import type { Campaign, CampaignInput } from "./types";

interface CampaignState {
  campaigns: Campaign[];
  activeId: string | null;
  load: () => Promise<void>;
  create: (input: CampaignInput) => Promise<Campaign>;
  update: (id: string, input: CampaignInput) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
}

export const useCampaignStore = create<CampaignState>((set, get) => {
  /** Reloads the list and re-resolves the active campaign, persisting it if it changed. */
  async function refresh(preferredId: string | null): Promise<void> {
    const db = await getDb();
    const campaigns = await repo.listCampaigns(db);
    const activeId = resolveActiveCampaignId(campaigns, preferredId);
    if (activeId !== (await getSetting(db, "activeCampaignId"))) {
      await setSetting(db, "activeCampaignId", activeId);
    }
    set({ campaigns, activeId });
  }

  return {
    campaigns: [],
    activeId: null,

    async load() {
      const db = await getDb();
      await refresh(await getSetting(db, "activeCampaignId"));
    },

    async create(input) {
      const created = await repo.createCampaign(await getDb(), input);
      await refresh(created.id);
      return created;
    },

    async update(id, input) {
      await repo.updateCampaign(await getDb(), id, input);
      await refresh(get().activeId);
    },

    async setArchived(id, archived) {
      await repo.setCampaignArchived(await getDb(), id, archived);
      await refresh(get().activeId);
    },

    async remove(id) {
      await repo.deleteCampaign(await getDb(), id);
      await refresh(get().activeId);
    },

    async setActive(id) {
      await refresh(id);
    },
  };
});

export function useActiveCampaign(): Campaign | null {
  return useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeId) ?? null);
}
