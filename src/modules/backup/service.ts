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
  listNotes,
  listTags,
  noteInsertStatements,
  parseNotesBackup,
  remapNoteMentions,
  remapNotes,
  tagInsertStatement,
  toNotesBackup,
} from "../notes";
import {
  emptyGraph,
  graphDiffStatements,
  listRelationTypes,
  loadGraph,
  parseGraphBackup,
  remapGraph,
  remapGraphMentions,
  restoreRelationTypes,
  toGraphBackup,
} from "../relations";
import {
  listSessions,
  parseSessionsBackup,
  remapSessions,
  sessionStatements,
  toSessionsBackup,
} from "../sessions";
import {
  emptyTimeline,
  loadTimeline,
  parseTimelineBackup,
  remapTimeline,
  remapTimelineMentions,
  timelineDiffStatements,
} from "../timeline";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  importedCampaignName,
  parseBackup,
  type CampaignBackupV4,
} from "./domain/format";

/** The campaign with its sessions, graph, timeline, maps and notes as JSON text. */
export async function exportCampaign(campaign: Campaign): Promise<string> {
  const db = await getDb();
  const [graph, types, timeline, battlemaps, notes, noteTags, sessions] = await Promise.all([
    loadGraph(db, campaign.id),
    listRelationTypes(db),
    loadTimeline(db, campaign.id),
    collectMapsBackup(db, campaign.id),
    listNotes(db, campaign.id),
    listTags(db, campaign.id),
    listSessions(db, campaign.id),
  ]);
  const cover = { artId: campaign.coverArtId, tokenId: null };
  const library = await collectLibraryRefs(db, [...graph.characters, ...graph.factions, cover]);
  const backup: CampaignBackupV4 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    campaign: {
      name: campaign.name,
      system: campaign.system,
      description: campaign.description,
      // Only an art the file carries a reference to can be found again.
      coverArtId: library.arts.some((a) => a.id === campaign.coverArtId)
        ? campaign.coverArtId
        : null,
      createdAt: campaign.createdAt,
    },
    library,
    relations: toGraphBackup(graph, types),
    timeline,
    battlemaps,
    notes: toNotesBackup(notes, noteTags),
    sessions: toSessionsBackup(sessions),
  };
  return JSON.stringify(backup);
}

export interface ImportReport {
  campaign: Campaign;
  characters: number;
  events: number;
  maps: number;
  notes: number;
  sessions: number;
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
  const notesIn = parseNotesBackup(envelope.notes, now);
  const sessionsIn = parseSessionsBackup(envelope.sessions, now);
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
    coverArtId: resolvePictureLink(
      { artId: envelope.campaign.coverArtId, tokenId: null },
      library.resolution,
    ).artId,
    archived: false,
    createdAt: envelope.campaign.createdAt,
    updatedAt: now,
  };
  const remappedGraph = remapGraph(
    graphIn,
    campaign.id,
    newId,
    (link) => resolvePictureLink(link, library.resolution),
    typeIds,
  );
  const { characterIds, factionIds } = remappedGraph;
  const remappedTimeline = remapTimeline(timelineIn, campaign.id, newId, characterIds);
  const remappedNotes = remapNotes(notesIn, campaign.id, newId, ru.notes.untitled);
  const maps = mapsIn.maps.map((m) => ({ ...m, newId: newId() }));

  // Mentions point to objects by id: move them to the new ids of this copy.
  const mentionIds = new Map([
    ...characterIds,
    ...factionIds,
    ...remappedTimeline.eventIds,
    ...remappedNotes.noteIds,
    ...maps.flatMap((m): [string, string][] => (m.id ? [[m.id, m.newId]] : [])),
  ]);
  const graph = remapGraphMentions(remappedGraph.graph, mentionIds);
  const timeline = remapTimelineMentions(remappedTimeline.timeline, mentionIds);
  const notes = { ...remappedNotes, notes: remapNoteMentions(remappedNotes.notes, mentionIds) };
  const sessions = remapSessions(sessionsIn, campaign.id, newId, {
    notes: remappedNotes.noteIds,
    events: remappedTimeline.eventIds,
    mentions: mentionIds,
  });

  await runScript(
    db,
    [
      campaignInsertStatement(campaign),
      ...library.statements,
      ...graphDiffStatements(emptyGraph, graph),
      ...timelineDiffStatements(campaign.id, emptyTimeline, timeline),
      ...maps.map(({ newId: id, ...m }) =>
        mapInsertStatement(id, campaign.id, {
          ...m,
          name: m.name || ru.battlemap.import.defaultName,
        }),
      ),
      ...notes.tags.map(tagInsertStatement),
      ...notes.notes.flatMap(noteInsertStatements),
      ...sessions.flatMap(sessionStatements),
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
    notes: notes.notes.length,
    sessions: sessions.length,
    mapsSkipped: mapsIn.skipped,
    arts: refs.arts.length,
    artsByHash: library.resolution.byHash,
    artsNotFound: library.resolution.notFound,
  };
}
