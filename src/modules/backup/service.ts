// Campaign backup use cases: gathering the data of every module, and restoring it in one script.
import { getDb, runScript } from "../../shared/db";
import { ru } from "../../shared/i18n/ru";
import {
  collectMapsBackup,
  mapInsertStatement,
  parseMapsBackup,
  restoreMapDefinitions,
} from "../battlemap";
import {
  CAMPAIGN_NAME_MAX,
  campaignInsertStatement,
  useCampaignStore,
  type Campaign,
} from "../campaigns";
import {
  collectLibraryRefs,
  parseArtRefs,
  reloadLibrary,
  resolveLibraryRefs,
  resolvePictureLink,
} from "../library";
import {
  emptyGraph,
  graphDiffStatements,
  listRelationTypes,
  loadGraph,
  parseGraphBackup,
  remapGraph,
  restoreRelationTypes,
  toGraphBackup,
} from "../relations";
import {
  emptyTimeline,
  loadTimeline,
  parseTimelineBackup,
  remapTimeline,
  timelineDiffStatements,
} from "../timeline";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  importedCampaignName,
  parseBackup,
  type CampaignBackupV1,
} from "./domain/format";

/** The campaign with its graph, timeline and maps as JSON text. */
export async function exportCampaign(campaign: Campaign): Promise<string> {
  const db = await getDb();
  const [graph, types, timeline, battlemaps] = await Promise.all([
    loadGraph(db, campaign.id),
    listRelationTypes(db),
    loadTimeline(db, campaign.id),
    collectMapsBackup(db, campaign.id),
  ]);
  const library = await collectLibraryRefs(db, [...graph.characters, ...graph.factions]);
  const backup: CampaignBackupV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    campaign: {
      name: campaign.name,
      system: campaign.system,
      description: campaign.description,
      createdAt: campaign.createdAt,
    },
    library,
    relations: toGraphBackup(graph, types),
    timeline,
    battlemaps,
  };
  return JSON.stringify(backup);
}

export interface ImportReport {
  campaign: Campaign;
  characters: number;
  events: number;
  maps: number;
  /** Maps whose data could not be read. */
  mapsSkipped: number;
  /** Arts the portraits use. */
  arts: number;
  /** Arts found by content after a rename or move. */
  artsByHash: number;
  /** Paths of the arts whose files are not in this library. */
  artsNotFound: string[];
}

/**
 * Restores a backup as a new campaign (every record gets a new id, so the backup can also be
 * imported next to its original) and makes it active. Arts are looked up in this library by path,
 * then by hash. Everything of the campaign is written in one transaction.
 */
export async function importCampaign(
  text: string,
  libraryRoot: string | null,
): Promise<ImportReport> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const newId = () => crypto.randomUUID();
  const envelope = parseBackup(text, now);
  const graphIn = parseGraphBackup(envelope.relations, now);
  const timelineIn = parseTimelineBackup(envelope.timeline, now);
  const mapsIn = parseMapsBackup(envelope.battlemaps, now);
  const refs = parseArtRefs(envelope.library, now);

  const db = await getDb();
  const library = await resolveLibraryRefs(db, libraryRoot, refs, newId);

  // App-wide definitions first: they are matched by id and harmless if the import fails later.
  await restoreRelationTypes(graphIn.relationTypes);
  await restoreMapDefinitions(mapsIn.customTypes, mapsIn.objects);
  const typeIds = new Set((await listRelationTypes(db)).map((t) => t.id));

  const campaigns = useCampaignStore.getState().campaigns;
  const campaign: Campaign = {
    id: newId(),
    name: importedCampaignName(
      envelope.campaign.name,
      campaigns.map((c) => c.name),
      ru.backup.importedSuffix,
      CAMPAIGN_NAME_MAX,
    ),
    system: envelope.campaign.system,
    description: envelope.campaign.description,
    archived: false,
    createdAt: envelope.campaign.createdAt,
    updatedAt: now,
  };
  const { graph, characterIds } = remapGraph(
    graphIn,
    campaign.id,
    newId,
    (link) => resolvePictureLink(link, library.resolution),
    typeIds,
  );
  const timeline = remapTimeline(timelineIn, campaign.id, newId, characterIds);

  await runScript(
    db,
    [
      campaignInsertStatement(campaign),
      ...library.statements,
      ...graphDiffStatements(emptyGraph, graph),
      ...timelineDiffStatements(campaign.id, emptyTimeline, timeline),
      ...mapsIn.maps.map((m) =>
        mapInsertStatement(newId(), campaign.id, {
          ...m,
          name: m.name || ru.battlemap.import.defaultName,
        }),
      ),
    ],
    Number.MAX_SAFE_INTEGER,
  );

  await useCampaignStore.getState().setActive(campaign.id);
  if (library.statements.length > 0) await reloadLibrary();

  return {
    campaign,
    characters: graph.characters.length,
    events: timeline.events.length,
    maps: mapsIn.maps.length,
    mapsSkipped: mapsIn.skipped,
    arts: refs.arts.length,
    artsByHash: library.resolution.byHash,
    artsNotFound: library.resolution.notFound,
  };
}
