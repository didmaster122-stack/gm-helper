import type { Campaign } from "./types";

/**
 * Keeps the preferred campaign active if it still exists and is not archived;
 * otherwise falls back to the first active campaign, or none.
 */
export function resolveActiveCampaignId(
  campaigns: readonly Campaign[],
  preferredId: string | null,
): string | null {
  const preferred = campaigns.find((c) => c.id === preferredId);
  if (preferred && !preferred.archived) return preferred.id;
  return campaigns.find((c) => !c.archived)?.id ?? null;
}
