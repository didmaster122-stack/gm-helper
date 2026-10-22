import { isRecord, readDate, readRecords, readString, readStrings } from "../../../shared/parse";
import type { CellType } from "./cellTypes";
import { fromJson, type BattlemapJson } from "./format";
import {
  parseGmmapObjects,
  parseGmmapTypes,
  toGmmapFile,
  type GmmapObject,
  type GmmapType,
} from "./gmmapFile";
import type { BattlemapModel } from "./grid";
import { isImageDataUrl } from "./images";
import type { ObjectDef } from "./objects";

/** A map of the campaign with everything shown in its gallery card. */
export interface MapEntry {
  /** Id of the map in a backup, so mentions of it can follow it to the restored copy. */
  id?: string;
  name: string;
  description: string;
  tags: string[];
  /** Gallery picture as a data URL ('' when none). */
  preview: string;
  createdAt: string;
  updatedAt: string;
  model: BattlemapModel;
}

export interface StoredMapEntry extends Omit<MapEntry, "model"> {
  map: BattlemapJson;
}

/** Battlemap section of a campaign backup: maps plus the custom types and objects they use. */
export interface MapsBackup {
  maps: StoredMapEntry[];
  customTypes: GmmapType[];
  objects: GmmapObject[];
}

export interface ParsedMaps {
  maps: MapEntry[];
  customTypes: GmmapType[];
  objects: GmmapObject[];
  /** Maps whose data could not be read. */
  skipped: number;
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

export function toMapsBackup(
  entries: readonly MapEntry[],
  types: readonly CellType[],
  objectDefs: readonly ObjectDef[],
): MapsBackup {
  // The .gmmap.json serializer already knows which custom types and objects a map uses.
  const files = entries.map(({ model, ...info }) => ({
    info,
    file: toGmmapFile(info, model, types, objectDefs),
  }));
  return {
    maps: files.map(({ info, file }) => ({ ...info, map: file.map })),
    customTypes: uniqueById(files.flatMap(({ file }) => file.customTypes)),
    objects: uniqueById(files.flatMap(({ file }) => file.objects)),
  };
}

/** Maps with unreadable data are counted in `skipped`; an empty name is left for the caller. */
export function parseMapsBackup(raw: unknown, now: string): ParsedMaps {
  const section = isRecord(raw) ? raw : {};
  const maps: MapEntry[] = [];
  let skipped = 0;
  for (const entry of readRecords(section.maps)) {
    try {
      maps.push({
        ...(typeof entry.id === "string" && entry.id !== "" ? { id: entry.id } : {}),
        name: readString(entry.name).trim(),
        description: readString(entry.description),
        tags: readStrings(entry.tags),
        preview: isImageDataUrl(entry.preview) ? entry.preview : "",
        createdAt: readDate(entry.createdAt, now),
        updatedAt: readDate(entry.updatedAt, now),
        model: fromJson(entry.map),
      });
    } catch {
      skipped++;
    }
  }
  return {
    maps,
    customTypes: parseGmmapTypes(section.customTypes),
    objects: parseGmmapObjects(section.objects),
    skipped,
  };
}
