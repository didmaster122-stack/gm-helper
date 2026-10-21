// Recently opened objects of each campaign, shown on the welcome screen. Local only.
import { getDb } from "./client";
import { runScript, sqlLiteral } from "./script";
import type { Db } from "./types";

export type RecentKind = "battlemap" | "note" | "art" | "event" | "character";

export interface RecentItem {
  campaignId: string;
  kind: RecentKind;
  objectId: string;
  openedAt: string;
}

/** Older rows of a campaign are dropped on each write. */
export const RECENT_KEEP = 30;

interface RecentRow {
  campaign_id: string;
  kind: RecentKind;
  object_id: string;
  opened_at: string;
}

export async function recordRecent(db: Db, item: RecentItem): Promise<void> {
  const campaign = sqlLiteral(item.campaignId);
  await runScript(db, [
    `INSERT INTO recent_items (campaign_id, kind, object_id, opened_at)
     VALUES (${campaign}, ${sqlLiteral(item.kind)}, ${sqlLiteral(item.objectId)}, ${sqlLiteral(item.openedAt)})
     ON CONFLICT (campaign_id, kind, object_id) DO UPDATE SET opened_at = excluded.opened_at`,
    `DELETE FROM recent_items WHERE campaign_id = ${campaign} AND rowid NOT IN (
       SELECT rowid FROM recent_items WHERE campaign_id = ${campaign}
       ORDER BY opened_at DESC LIMIT ${RECENT_KEEP})`,
  ]);
}

/** Newest first. */
export async function listRecent(db: Db, campaignId: string): Promise<RecentItem[]> {
  const rows = await db.select<RecentRow>(
    "SELECT * FROM recent_items WHERE campaign_id = ? ORDER BY opened_at DESC",
    [campaignId],
  );
  return rows.map((r) => ({
    campaignId: r.campaign_id,
    kind: r.kind,
    objectId: r.object_id,
    openedAt: r.opened_at,
  }));
}

export async function forgetRecent(db: Db, items: readonly RecentItem[]): Promise<void> {
  if (items.length === 0) return;
  await runScript(
    db,
    items.map(
      (i) =>
        `DELETE FROM recent_items WHERE campaign_id = ${sqlLiteral(i.campaignId)}
         AND kind = ${sqlLiteral(i.kind)} AND object_id = ${sqlLiteral(i.objectId)}`,
    ),
  );
}

/** Notes that the object was opened now. The journal is a convenience: failures are only logged. */
export function rememberOpened(campaignId: string, kind: RecentKind, objectId: string): void {
  const openedAt = new Date().toISOString();
  void getDb()
    .then((db) => recordRecent(db, { campaignId, kind, objectId, openedAt }))
    .catch((error: unknown) => console.error("Failed to remember a recent object", error));
}
