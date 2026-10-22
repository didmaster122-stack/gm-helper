import { safeFileName } from "../../../shared/fs/names";
import { isRecord, readDate, readNullableString, readString } from "../../../shared/parse";
import type { MapsBackup } from "../../battlemap";
import type { ArtRefs } from "../../library";
import type { NotesBackup } from "../../notes";
import type { GraphBackup } from "../../relations";
import type { SessionsBackup } from "../../sessions";
import type { TimelineBackup } from "../../timeline";

export const BACKUP_FORMAT = "gm-helper.campaign";
/**
 * 2: token records got `cells` and `frame` (read with defaults from version 1 files).
 * 3: the `notes` section (files of versions 1 and 2 are read with no notes).
 * 4: the `sessions` section and the campaign cover (`campaign.coverArtId`); older files are
 *    converted with no sessions and no cover. Sessions later got `recap` and `recapEventId`,
 *    read as empty when a file has none.
 */
export const BACKUP_VERSION = 4;

export interface BackupCampaign {
  name: string;
  system: string;
  description: string;
  /** Id of the cover art in `library.arts`, or null. */
  coverArtId: string | null;
  createdAt: string;
}

/**
 * One campaign in one JSON file. Arts are not inside: they are files of the library, so the file
 * keeps their relative paths and hashes (`library`) and the import finds them again.
 */
export interface CampaignBackupV4 {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  campaign: BackupCampaign;
  library: ArtRefs;
  relations: GraphBackup;
  timeline: TimelineBackup;
  battlemaps: MapsBackup;
  notes: NotesBackup;
  sessions: SessionsBackup;
}

/** The checked envelope; each section is read by the module it belongs to. */
export interface BackupEnvelope {
  campaign: BackupCampaign;
  library: unknown;
  relations: unknown;
  timeline: unknown;
  battlemaps: unknown;
  notes: unknown;
  sessions: unknown;
}

export type BackupErrorKind = "notJson" | "notBackup" | "newerVersion" | "badCampaign";

export class BackupError extends Error {
  constructor(readonly kind: BackupErrorKind) {
    super(`Invalid campaign backup: ${kind}`);
  }
}

/**
 * Brings an older file to the current version before the sections are read. Versions 1 to 3 differ
 * by fields and sections that are read with defaults (token frame and size, no notes); version 4
 * added sessions and the cover, which older files do not have.
 */
function upgrade(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version === BACKUP_VERSION) return raw;
  const campaign = isRecord(raw.campaign) ? raw.campaign : {};
  return {
    ...raw,
    version: BACKUP_VERSION,
    campaign: { ...campaign, coverArtId: null },
    sessions: { sessions: [] },
  };
}

/** Reads the file, checks its envelope and converts older versions. */
export function parseBackup(text: string, now: string): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("notJson");
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT || typeof parsed.version !== "number") {
    throw new BackupError("notBackup");
  }
  if (parsed.version > BACKUP_VERSION) throw new BackupError("newerVersion");
  if (![1, 2, 3, 4].includes(parsed.version)) throw new BackupError("notBackup");
  const raw = upgrade(parsed);

  const campaign = isRecord(raw.campaign) ? raw.campaign : {};
  const name = readString(campaign.name).trim();
  const system = readString(campaign.system).trim();
  if (name === "" || system === "") throw new BackupError("badCampaign");
  return {
    campaign: {
      name,
      system,
      description: readString(campaign.description),
      coverArtId: readNullableString(campaign.coverArtId),
      createdAt: readDate(campaign.createdAt, now),
    },
    library: raw.library,
    relations: raw.relations,
    timeline: raw.timeline,
    battlemaps: raw.battlemaps,
    notes: raw.notes,
    sessions: raw.sessions,
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
