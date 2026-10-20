import { safeFileName } from "../../../shared/fs/names";
import { isRecord, readDate, readString } from "../../../shared/parse";
import type { MapsBackup } from "../../battlemap";
import type { ArtRefs } from "../../library";
import type { GraphBackup } from "../../relations";
import type { TimelineBackup } from "../../timeline";

export const BACKUP_FORMAT = "gm-helper.campaign";
export const BACKUP_VERSION = 1;

export interface BackupCampaign {
  name: string;
  system: string;
  description: string;
  createdAt: string;
}

/**
 * One campaign in one JSON file. Arts are not inside: they are files of the library, so the file
 * keeps their relative paths and hashes (`library`) and the import finds them again.
 */
export interface CampaignBackupV1 {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  campaign: BackupCampaign;
  library: ArtRefs;
  relations: GraphBackup;
  timeline: TimelineBackup;
  battlemaps: MapsBackup;
}

/** The checked envelope; each section is read by the module it belongs to. */
export interface BackupEnvelope {
  campaign: BackupCampaign;
  library: unknown;
  relations: unknown;
  timeline: unknown;
  battlemaps: unknown;
}

export type BackupErrorKind = "notJson" | "notBackup" | "newerVersion" | "badCampaign";

export class BackupError extends Error {
  constructor(readonly kind: BackupErrorKind) {
    super(`Invalid campaign backup: ${kind}`);
  }
}

/**
 * Reads the file and checks its envelope. A later format version gets a converter here that
 * turns the older `raw` into the current one before the sections are read.
 */
export function parseBackup(text: string, now: string): BackupEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("notJson");
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT || typeof raw.version !== "number") {
    throw new BackupError("notBackup");
  }
  if (raw.version > BACKUP_VERSION) throw new BackupError("newerVersion");
  if (raw.version !== 1) throw new BackupError("notBackup");

  const campaign = isRecord(raw.campaign) ? raw.campaign : {};
  const name = readString(campaign.name).trim();
  const system = readString(campaign.system).trim();
  if (name === "" || system === "") throw new BackupError("badCampaign");
  return {
    campaign: {
      name,
      system,
      description: readString(campaign.description),
      createdAt: readDate(campaign.createdAt, now),
    },
    library: raw.library,
    relations: raw.relations,
    timeline: raw.timeline,
    battlemaps: raw.battlemaps,
  };
}

export function backupFileName(campaignName: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `${safeFileName(campaignName, "campaign")} ${day}.gmcampaign.json`;
}

/**
 * Name for the imported campaign: as in the file, or with `suffix` (and a number) when a campaign
 * with that name already exists, so the copy is easy to tell apart. Cut to `maxLength`.
 */
export function importedCampaignName(
  name: string,
  existing: readonly string[],
  suffix: string,
  maxLength: number,
): string {
  const taken = new Set(existing.map((n) => n.toLocaleLowerCase("ru")));
  const fit = (s: string) => s.slice(0, maxLength).trim();
  if (!taken.has(fit(name).toLocaleLowerCase("ru"))) return fit(name);
  for (let n = 1; ; n++) {
    const tail = n === 1 ? ` (${suffix})` : ` (${suffix} ${n})`;
    const candidate = fit(name.slice(0, Math.max(1, maxLength - tail.length)).trim() + tail);
    if (!taken.has(candidate.toLocaleLowerCase("ru"))) return candidate;
  }
}
