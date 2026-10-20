import {
  decodeSymbol,
  encodeSymbol,
  isBuiltinTypeId,
  isHexColor,
  symbolImage,
  type CellType,
} from "./cellTypes";
import { fromJson, toJson, type BattlemapJson } from "./format";
import type { BattlemapModel } from "./grid";
import { isImageDataUrl } from "./images";
import { isValidObjectSize, usedObjectDefs, type ObjectDef } from "./objects";

export const GMMAP_FORMAT = "gm-helper.battlemap";
export const GMMAP_VERSION = 2;

/** Custom type as stored in the file, so the map looks the same on another PC. */
export interface GmmapType {
  id: string;
  name: string;
  color: string;
  symbol: string;
  /** Picture as a data URL, empty when none (added in version 2). */
  image: string;
  blocksMove: boolean;
  blocksSight: boolean;
  comment: string;
}

/** Catalog object used on the map (added in version 2). */
export interface GmmapObject {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string;
  symbol: string;
  image: string;
  blocksMove: boolean;
  blocksSight: boolean;
}

export interface GmmapFileV2 {
  format: typeof GMMAP_FORMAT;
  version: 2;
  name: string;
  description: string;
  map: BattlemapJson;
  customTypes: GmmapType[];
  objects: GmmapObject[];
}

export interface GmmapContent {
  name: string;
  description: string;
  model: BattlemapModel;
  customTypes: GmmapType[];
  objects: GmmapObject[];
}

/** Builds the file; only custom types and catalog objects the map actually uses are included. */
export function toGmmapFile(
  info: { name: string; description: string },
  model: BattlemapModel,
  types: readonly CellType[],
  objectDefs: readonly ObjectDef[],
): GmmapFileV2 {
  const map = toJson(model);
  const used = new Set<string | null>([...map.palette, ...map.regions.map((r) => r.typeId)]);
  const usedDefs = new Set(usedObjectDefs(model));
  return {
    format: GMMAP_FORMAT,
    version: GMMAP_VERSION,
    name: info.name,
    description: info.description,
    map,
    customTypes: types
      .filter((t) => !t.builtin && used.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        symbol: encodeSymbol(t.symbol),
        image: symbolImage(t.symbol),
        blocksMove: t.blocksMove,
        blocksSight: t.blocksSight !== "no",
        comment: t.comment,
      })),
    objects: objectDefs
      .filter((d) => usedDefs.has(d.id))
      .map((d) => ({
        id: d.id,
        name: d.name,
        width: d.width,
        height: d.height,
        color: d.color,
        symbol: encodeSymbol(d.symbol),
        image: symbolImage(d.symbol),
        blocksMove: d.blocksMove,
        blocksSight: d.blocksSight,
      })),
  };
}

function fail(reason: string): never {
  throw new Error(`Invalid .gmmap.json: ${reason}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Symbol text normalized the same way the app stores it. */
function parseSymbol(symbol: unknown): string {
  return typeof symbol === "string" ? encodeSymbol(decodeSymbol(symbol)) : "";
}

const parseImage = (image: unknown): string => (isImageDataUrl(image) ? image : "");
const parseColor = (color: unknown): string =>
  typeof color === "string" && isHexColor(color) ? color : "#808080";

function parseType(raw: unknown): GmmapType | null {
  if (!isRecord(raw)) return null;
  const { id, name, color, symbol, image, blocksMove, blocksSight, comment } = raw;
  if (typeof id !== "string" || id === "" || isBuiltinTypeId(id)) return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  return {
    id,
    name: name.trim(),
    color: parseColor(color),
    symbol: parseSymbol(symbol),
    image: parseImage(image),
    blocksMove: blocksMove === true,
    blocksSight: blocksSight === true,
    // Optional: files saved before comments existed have none.
    comment: typeof comment === "string" ? comment.trim() : "",
  };
}

function parseObjectDef(raw: unknown): GmmapObject | null {
  if (!isRecord(raw)) return null;
  const { id, name, width, height, color, symbol, image, blocksMove, blocksSight } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof width !== "number" || !isValidObjectSize(width)) return null;
  if (typeof height !== "number" || !isValidObjectSize(height)) return null;
  return {
    id,
    name: name.trim(),
    width,
    height,
    color: parseColor(color),
    symbol: parseSymbol(symbol),
    image: parseImage(image),
    blocksMove: blocksMove === true,
    blocksSight: blocksSight === true,
  };
}

/** Reads version 1 (no objects, no pictures) and version 2 files. */
export function parseGmmapFile(text: string): GmmapContent {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail("not JSON");
  }
  if (!isRecord(raw) || raw.format !== GMMAP_FORMAT) fail("not a GM Helper map");
  if (raw.version !== 1 && raw.version !== 2) fail(`unsupported version ${String(raw.version)}`);
  const name = typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name.trim() : "";
  return {
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    model: fromJson(raw.map),
    customTypes: parseGmmapTypes(raw.customTypes),
    objects: parseGmmapObjects(raw.objects),
  };
}

/** Custom types of a map file or a campaign backup; invalid entries are skipped. */
export function parseGmmapTypes(raw: unknown): GmmapType[] {
  return Array.isArray(raw) ? raw.map(parseType).filter((t): t is GmmapType => t !== null) : [];
}

/** Catalog objects of a map file or a campaign backup; invalid entries are skipped. */
export function parseGmmapObjects(raw: unknown): GmmapObject[] {
  return Array.isArray(raw)
    ? raw.map(parseObjectDef).filter((d): d is GmmapObject => d !== null)
    : [];
}
