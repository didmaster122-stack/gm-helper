// Mentions (spec §1.6) need every section: the objects that can be mentioned, opening them and
// finding where they are mentioned. The modules give the data; this file puts it together.
import { useEffect } from "react";
import { mapSearchRecords } from "../modules/battlemap";
import { useCampaignStore } from "../modules/campaigns";
import { noteSearchRecords, notesMentioning } from "../modules/notes";
import { relationSearchRecords, relationsMentioning } from "../modules/relations";
import { eventSearchRecords, eventsMentioning } from "../modules/timeline";
import { getDb } from "../shared/db";
import {
  configureMentions,
  isMentionKind,
  refreshMentions,
  setMentionCampaign,
  type MentionServices,
  type MentionTarget,
} from "../shared/mentions";
import { openSearchRecord } from "./search";
import { useAppStore } from "./store";

const services: MentionServices = {
  async load(campaignId) {
    const db = await getDb();
    const sources = await Promise.all([
      relationSearchRecords(db, [campaignId]),
      eventSearchRecords(db, [campaignId]),
      noteSearchRecords(db, [campaignId]),
      mapSearchRecords(db, [campaignId]),
    ]);
    return sources
      .flat()
      .flatMap((r): MentionTarget[] =>
        isMentionKind(r.kind) ? [{ kind: r.kind, id: r.id, title: r.title }] : [],
      );
  },
  open(kind, id) {
    const campaignId = useCampaignStore.getState().activeId;
    return openSearchRecord({ kind, id, campaignId, title: "" });
  },
  async mentionedIn(campaignId, _kind, id) {
    const db = await getDb();
    const lists = await Promise.all([
      notesMentioning(db, campaignId, id),
      relationsMentioning(db, campaignId, id),
      eventsMentioning(db, campaignId, id),
    ]);
    return lists.flat().sort((a, b) => a.title.localeCompare(b.title, "ru"));
  },
};

/** Keeps the mentionable objects of the active campaign loaded; names change in every section. */
export function useMentions(): void {
  const activeId = useCampaignStore((s) => s.activeId);
  const module = useAppStore((s) => s.module);
  const welcome = useAppStore((s) => s.welcome);

  useEffect(() => {
    configureMentions(services);
  }, []);

  useEffect(() => {
    setMentionCampaign(activeId);
  }, [activeId]);

  useEffect(() => {
    void refreshMentions();
  }, [module, welcome]);
}
