// Links from other data (character portraits in a campaign backup) to arts and tokens of the
// library. Ids differ between PCs, so a link travels as the relative path and the content hash.

import {
  isRecord,
  readDate,
  readNullableString,
  readNumber,
  readRecords,
  readString,
} from "../../../shared/parse";
import {
  DEFAULT_CREATURE_SIZE,
  DEFAULT_CROP,
  DEFAULT_TOKEN_SIZE,
  isCreatureSize,
  isTokenSize,
} from "./tokenCrop";
import { normalizeFrame } from "./tokenFrame";
import type { Art, Token } from "./types";

export interface ArtRef {
  /** Id on the PC the backup was made on. */
  id: string;
  relPath: string;
  hash: string | null;
}

/** A token record travels whole: its PNG is in the library, but the record is in the database. */
export interface TokenRef extends Omit<Token, "artId"> {
  /** Id of the art in {@link ArtRefs.arts}. */
  artId: string;
}

export interface ArtRefs {
  arts: ArtRef[];
  tokens: TokenRef[];
}

/** What a portrait points to. */
export interface PictureLink {
  artId: string | null;
  tokenId: string | null;
}

/** The arts and tokens the given links use; links to deleted records are skipped. */
export function collectArtRefs(
  links: readonly PictureLink[],
  arts: readonly Art[],
  tokens: readonly Token[],
): ArtRefs {
  const artById = new Map(arts.map((a) => [a.id, a]));
  const tokenById = new Map(tokens.map((t) => [t.id, t]));
  const artIds = new Set<string>();
  const tokenIds = new Set<string>();
  for (const link of links) {
    if (!link.artId || !artById.has(link.artId)) continue;
    artIds.add(link.artId);
    const token = link.tokenId ? tokenById.get(link.tokenId) : undefined;
    if (token && token.artId === link.artId) tokenIds.add(token.id);
  }
  return {
    arts: [...artIds].flatMap((id) => {
      const art = artById.get(id);
      return art ? [{ id: art.id, relPath: art.relPath, hash: art.hash }] : [];
    }),
    tokens: [...tokenIds].flatMap((id) => {
      const token = tokenById.get(id);
      return token ? [token] : [];
    }),
  };
}

export function parseArtRefs(raw: unknown, now: string): ArtRefs {
  const section = isRecord(raw) ? raw : {};
  const arts = readRecords(section.arts).flatMap((r) => {
    const id = readString(r.id);
    const relPath = readString(r.relPath);
    return id && relPath ? [{ id, relPath, hash: readNullableString(r.hash) }] : [];
  });
  const tokens = readRecords(section.tokens).flatMap((r): TokenRef[] => {
    const id = readString(r.id);
    const artId = readString(r.artId);
    const relPath = readString(r.relPath);
    if (!id || !artId || !relPath) return [];
    const size = readNumber(r.size);
    const cells = readNumber(r.cells);
    const crop = isRecord(r.crop) ? r.crop : {};
    // Version 1 files have no size and frame: a 1×1 token without a frame.
    const frame = isRecord(r.frame) ? r.frame : {};
    return [
      {
        id,
        artId,
        relPath,
        size: isTokenSize(size) ? size : DEFAULT_TOKEN_SIZE,
        cells: isCreatureSize(cells) ? cells : DEFAULT_CREATURE_SIZE,
        frame: normalizeFrame(frame.color, frame.width),
        crop: {
          centerX: readNumber(crop.centerX, DEFAULT_CROP.centerX),
          centerY: readNumber(crop.centerY, DEFAULT_CROP.centerY),
          zoom: readNumber(crop.zoom, DEFAULT_CROP.zoom) || DEFAULT_CROP.zoom,
        },
        createdAt: readDate(r.createdAt, now),
        updatedAt: readDate(r.updatedAt, now),
      },
    ];
  });
  return { arts, tokens };
}

export interface ArtResolution {
  /** Backup art id → art of this library. Unresolved ids are absent. */
  arts: ReadonlyMap<string, string>;
  /** Backup token id → token of this library. Unresolved ids are absent. */
  tokens: ReadonlyMap<string, string>;
  /** Token records to create: the PNG is in the library, but this PC has no record of it. */
  newTokens: Token[];
  /** Arts found at the same path. */
  byPath: number;
  /** Arts found by content after a rename or move. */
  byHash: number;
  /** Paths of the arts whose file is not in this library (the link is kept when a record exists). */
  notFound: string[];
}

/**
 * Finds the backup's arts in this library: by path first, then by content hash. A record whose
 * file is missing is linked as a last resort, so the portrait comes back with the file.
 */
export function resolveArtRefs(
  refs: ArtRefs,
  arts: readonly Art[],
  tokens: readonly Token[],
  tokenFileExists: (relPath: string) => boolean,
  newId: () => string,
): ArtResolution {
  const present = arts.filter((a) => !a.missing);
  const byPathPresent = new Map(present.map((a) => [a.relPath, a]));
  const byPathMissing = new Map(arts.filter((a) => a.missing).map((a) => [a.relPath, a]));
  const byHashPresent = new Map<string, Art[]>();
  for (const a of present) {
    if (!a.hash) continue;
    const list = byHashPresent.get(a.hash);
    if (list) list.push(a);
    else byHashPresent.set(a.hash, [a]);
  }

  const artIds = new Map<string, string>();
  let byPath = 0;
  let byHash = 0;
  const notFound: string[] = [];
  for (const ref of refs.arts) {
    const atPath = byPathPresent.get(ref.relPath);
    if (atPath) {
      artIds.set(ref.id, atPath.id);
      byPath++;
      continue;
    }
    const sameContent = ref.hash ? byHashPresent.get(ref.hash) : undefined;
    if (sameContent?.[0]) {
      const fileName = ref.relPath.slice(ref.relPath.lastIndexOf("/") + 1);
      const best = sameContent.find((a) => a.fileName === fileName) ?? sameContent[0];
      artIds.set(ref.id, best.id);
      byHash++;
      continue;
    }
    const missing = byPathMissing.get(ref.relPath);
    if (missing) artIds.set(ref.id, missing.id);
    notFound.push(ref.relPath);
  }

  const tokenIds = new Map<string, string>();
  const newTokens: Token[] = [];
  const tokensByPath = new Map(tokens.map((t) => [t.relPath, t]));
  for (const ref of refs.tokens) {
    const artId = artIds.get(ref.artId);
    if (!artId) continue;
    const existing = tokensByPath.get(ref.relPath);
    if (existing) {
      if (existing.artId === artId) tokenIds.set(ref.id, existing.id);
      continue;
    }
    if (!tokenFileExists(ref.relPath)) continue;
    const token: Token = { ...ref, id: newId(), artId };
    newTokens.push(token);
    tokensByPath.set(token.relPath, token);
    tokenIds.set(ref.id, token.id);
  }

  return { arts: artIds, tokens: tokenIds, newTokens, byPath, byHash, notFound };
}

/** The link in this library: the token is kept only together with its art. */
export function resolvePictureLink(link: PictureLink, resolution: ArtResolution): PictureLink {
  const artId = link.artId ? (resolution.arts.get(link.artId) ?? null) : null;
  const tokenId = artId && link.tokenId ? (resolution.tokens.get(link.tokenId) ?? null) : null;
  return { artId, tokenId };
}
