import type { Db } from "../../shared/db/types";
import { useCellTypeStore } from "./cellTypeStore";
import type { GmmapObject, GmmapType } from "./domain/gmmapFile";
import { toMapsBackup, type MapEntry, type MapsBackup } from "./domain/backup";
import { useObjectStore } from "./objectStore";
import * as repo from "./repo";

/** Maps of the campaign (templates are shared and not included) with the definitions they use. */
export async function collectMapsBackup(db: Db, campaignId: string): Promise<MapsBackup> {
  const entries: MapEntry[] = [];
  for (const summary of await repo.listMaps(db, campaignId)) {
    const map = await repo.getMap(db, summary.id);
    if (map) entries.push(map);
  }
  const [types, objectDefs] = await Promise.all([repo.listCellTypes(db), repo.listObjectDefs(db)]);
  return toMapsBackup(entries, types, objectDefs);
}

/** Adds the custom cell types and objects of a backup that this PC does not have yet. */
export async function restoreMapDefinitions(
  customTypes: readonly GmmapType[],
  objects: readonly GmmapObject[],
): Promise<void> {
  await useCellTypeStore.getState().importMissing(customTypes);
  await useObjectStore.getState().importMissing(objects);
}
