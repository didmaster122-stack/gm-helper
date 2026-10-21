// The "recent" journal: reads it with current titles and opens an object in its section.
import { mapTitles, showMap } from "../modules/battlemap";
import { artTitles, showArt } from "../modules/library";
import { noteTitles, showNoteById } from "../modules/notes";
import { characterTitles, showCharacter } from "../modules/relations";
import { eventTitles, showEvent } from "../modules/timeline";
import { forgetRecent, getDb, listRecent, type Db, type RecentKind } from "../shared/db";
import type { ModuleId } from "./store";
import { visibleRecent, type RecentEntry } from "./welcomeData";

const titleLookups: Record<RecentKind, (db: Db, ids: string[]) => Promise<Map<string, string>>> = {
  battlemap: mapTitles,
  note: noteTitles,
  art: artTitles,
  event: eventTitles,
  character: characterTitles,
};

/** The newest objects of the campaign that still exist; rows of deleted ones are dropped. */
export async function loadRecent(campaignId: string): Promise<RecentEntry[]> {
  const db = await getDb();
  const items = await listRecent(db, campaignId);
  const kinds = Object.keys(titleLookups) as RecentKind[];
  const titles = new Map(
    await Promise.all(
      kinds.map(async (kind) => {
        const ids = items.filter((i) => i.kind === kind).map((i) => i.objectId);
        return [kind, await titleLookups[kind](db, ids)] as const;
      }),
    ),
  );
  const { shown, gone } = visibleRecent(items, titles);
  await forgetRecent(db, gone).catch((error: unknown) => console.error(error));
  return shown;
}

export const RECENT_SECTIONS: Record<RecentKind, ModuleId> = {
  battlemap: "battlemaps",
  note: "notes",
  art: "library",
  event: "timeline",
  character: "relations",
};

/** Makes the object's section show it; the caller then switches to that section. */
export async function showRecent(entry: RecentEntry): Promise<void> {
  const { campaignId, objectId } = entry;
  switch (entry.kind) {
    case "battlemap":
      return showMap(objectId);
    case "note":
      return showNoteById(campaignId, objectId);
    case "art":
      return showArt(objectId);
    case "event":
      return showEvent(campaignId, objectId);
    case "character":
      return showCharacter(campaignId, objectId);
  }
}
