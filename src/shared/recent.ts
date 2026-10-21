import { useEffect } from "react";
import { rememberOpened, type RecentKind } from "./db";

/** Glancing at an object while moving through a list does not count as opening it. */
const SETTLE_MS = 800;

/** Puts the object shown on screen into the campaign's "recent" journal of the welcome screen. */
export function useRememberOpened(
  campaignId: string | null,
  kind: RecentKind,
  objectId: string | null,
): void {
  useEffect(() => {
    if (!campaignId || !objectId) return;
    const timer = setTimeout(() => rememberOpened(campaignId, kind, objectId), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [campaignId, kind, objectId]);
}
