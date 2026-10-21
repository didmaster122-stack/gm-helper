export interface Campaign {
  id: string;
  name: string;
  /** Name of the top-level library folder (game system). */
  system: string;
  description: string;
  /** Art of the library shown as the cover; null for a gradient made from the name. */
  coverArtId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  name: string;
  system: string;
  description: string;
  coverArtId: string | null;
}

export type CampaignInputError =
  "nameRequired" | "nameTooLong" | "systemRequired" | "systemInvalid";

export const CAMPAIGN_NAME_MAX = 100;
