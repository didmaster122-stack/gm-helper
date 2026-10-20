export interface Campaign {
  id: string;
  name: string;
  /** Name of the top-level library folder (game system). */
  system: string;
  description: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  name: string;
  system: string;
  description: string;
}

export type CampaignInputError =
  "nameRequired" | "nameTooLong" | "systemRequired" | "systemInvalid";

export const CAMPAIGN_NAME_MAX = 100;
