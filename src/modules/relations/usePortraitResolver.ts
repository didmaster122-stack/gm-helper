import { useMemo } from "react";
import { toAbsolute, tokenUrl, useLibraryStore } from "../library";
import type { Portrait } from "./domain/types";

/** What to draw for a character's or faction's picture. */
export type PortraitImage =
  | { kind: "none" }
  /** The library is still being read. */
  | { kind: "pending" }
  /** The art is gone (deleted, or its file is missing). */
  | { kind: "missing" }
  | { kind: "token"; url: string }
  /** No token: the art is shown cropped to a circle. */
  | { kind: "art"; path: string; hash: string | null };

/** Resolves portraits against the open library: the token if it still exists, otherwise the art. */
export function usePortraitResolver(libraryRoot: string): (p: Portrait) => PortraitImage {
  const root = useLibraryStore((s) => s.root);
  const arts = useLibraryStore((s) => s.arts);
  const tokens = useLibraryStore((s) => s.tokens);
  const syncing = useLibraryStore((s) => s.syncing);

  return useMemo(() => {
    const artById = new Map(arts.map((a) => [a.id, a]));
    const tokenById = new Map(tokens.map((t) => [t.id, t]));
    const ready = root === libraryRoot && !(syncing && arts.length === 0);
    return (p: Portrait): PortraitImage => {
      if (!p.artId) return { kind: "none" };
      if (!ready) return { kind: "pending" };
      const art = artById.get(p.artId);
      if (!art || art.missing) return { kind: "missing" };
      const token = p.tokenId ? tokenById.get(p.tokenId) : undefined;
      if (token && token.artId === art.id)
        return { kind: "token", url: tokenUrl(libraryRoot, token) };
      return { kind: "art", path: toAbsolute(libraryRoot, art.relPath), hash: art.hash };
    };
  }, [root, libraryRoot, arts, tokens, syncing]);
}
