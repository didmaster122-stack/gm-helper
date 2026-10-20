import {
  decodeSymbol,
  encodeSymbol,
  isBuiltinTypeId,
  isHexColor,
  type CellType,
} from "./cellTypes";
import { fromJson, toJson, type BattlemapJson } from "./format";
import type { BattlemapModel } from "./grid";

export const GMMAP_FORMAT = "gm-helper.battlemap";
export const GMMAP_VERSION = 1;

/** Custom type as stored in the file, so the map looks the same on another PC. */
export interface GmmapType {
  id: string;
  name: string;
  color: string;
  symbol: string;
  blocksMove: boolean;
  blocksSight: boolean;
  comment: string;
}

export interface GmmapFileV1 {
  format: typeof GMMAP_FORMAT;
  version: 1;
  name: string;
  description: string;
  map: BattlemapJson;
  customTypes: GmmapType[];
}

export interface GmmapContent {
  name: string;
  description: string;
  model: BattlemapModel;
  customTypes: GmmapType[];
}

/** Builds the file; only custom types the map actually uses are included. */
export function toGmmapFile(
  info: { name: string; description: string },
  model: BattlemapModel,
  types: readonly CellType[],
): GmmapFileV1 {
  const map = toJson(model);
  const used = new Set([...map.palette, ...map.regions.map((r) => r.typeId)]);
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
        blocksMove: t.blocksMove,
        blocksSight: t.blocksSight !== "no",
        comment: t.comment,
      })),
  };
}

function fail(reason: string): never {
  throw new Error(`Invalid .gmmap.json: ${reason}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseType(raw: unknown): GmmapType | null {
  if (!isRecord(raw)) return null;
  const { id, name, color, symbol, blocksMove, blocksSight, comment } = raw;
  if (typeof id !== "string" || id === "" || isBuiltinTypeId(id)) return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  return {
    id,
    name: name.trim(),
    color: typeof color === "string" && isHexColor(color) ? color : "#808080",
    symbol: typeof symbol === "string" ? encodeSymbol(decodeSymbol(symbol)) : "",
    blocksMove: blocksMove === true,
    blocksSight: blocksSight === true,
    // Optional: files saved before comments existed have none.
    comment: typeof comment === "string" ? comment.trim() : "",
  };
}

export function parseGmmapFile(text: string): GmmapContent {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail("not JSON");
  }
  if (!isRecord(raw) || raw.format !== GMMAP_FORMAT) fail("not a GM Helper map");
  if (raw.version !== 1) fail(`unsupported version ${String(raw.version)}`);
  const name = typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name.trim() : "";
  return {
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    model: fromJson(raw.map),
    customTypes: Array.isArray(raw.customTypes)
      ? raw.customTypes.map(parseType).filter((t): t is GmmapType => t !== null)
      : [],
  };
}
