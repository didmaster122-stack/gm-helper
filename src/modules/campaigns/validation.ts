import { CAMPAIGN_NAME_MAX, type CampaignInput, type CampaignInputError } from "./types";

// Characters Windows forbids in folder names; the system is a library folder.
const INVALID_FOLDER_CHARS = /[<>:"/\\|?*]/;

export function normalizeCampaignInput(input: CampaignInput): CampaignInput {
  return {
    name: input.name.trim(),
    system: input.system.trim(),
    description: input.description.trim(),
  };
}

export function validateCampaignInput(input: CampaignInput): CampaignInputError[] {
  const { name, system } = normalizeCampaignInput(input);
  const errors: CampaignInputError[] = [];
  if (name === "") errors.push("nameRequired");
  else if (name.length > CAMPAIGN_NAME_MAX) errors.push("nameTooLong");
  if (system === "") errors.push("systemRequired");
  else if (INVALID_FOLDER_CHARS.test(system) || system.startsWith("_") || system.startsWith(".")) {
    errors.push("systemInvalid");
  }
  return errors;
}
