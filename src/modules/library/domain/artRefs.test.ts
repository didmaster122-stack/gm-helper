import { describe, expect, it } from "vitest";
import {
  collectArtRefs,
  parseArtRefs,
  resolveArtRefs,
  resolvePictureLink,
  type ArtRefs,
} from "./artRefs";
import { classifyPath } from "./paths";
import type { Art, Token } from "./types";

const T = "2026-10-20T12:00:00.000Z";

function art(id: string, relPath: string, extra: Partial<Art> = {}): Art {
  return {
    id,
    relPath,
    ...classifyPath(relPath),
    size: 100,
    mtime: 1,
    hash: `hash:${id}`,
    width: 10,
    height: 10,
    displayName: null,
    tags: [],
    missing: false,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}

function token(id: string, artId: string, relPath: string): Token {
  return {
    id,
    artId,
    relPath,
    size: 512,
    cells: 2,
    frame: { color: "#b3261e", width: 8 },
    crop: { centerX: 0.4, centerY: 0.3, zoom: 2 },
    createdAt: T,
    updatedAt: T,
  };
}

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

describe("collectArtRefs", () => {
  it("collects the arts and tokens the links use, once each", () => {
    const arts = [art("a", "S/G/a.png"), art("b", "S/G/b.png"), art("c", "S/G/c.png")];
    const tokens = [token("ta", "a", "S/G/_tokens/a.token-1.png"), token("tb", "b", "x.png")];
    const refs = collectArtRefs(
      [
        { artId: "a", tokenId: "ta" },
        { artId: "a", tokenId: null },
        // A token of another art is not kept.
        { artId: "c", tokenId: "tb" },
        { artId: "deleted", tokenId: null },
        { artId: null, tokenId: null },
      ],
      arts,
      tokens,
    );
    expect(refs.arts).toEqual([
      { id: "a", relPath: "S/G/a.png", hash: "hash:a" },
      { id: "c", relPath: "S/G/c.png", hash: "hash:c" },
    ]);
    expect(refs.tokens.map((t) => t.id)).toEqual(["ta"]);
  });

  it("survives a JSON round trip", () => {
    const refs = collectArtRefs(
      [{ artId: "a", tokenId: "ta" }],
      [art("a", "S/G/a.png")],
      [token("ta", "a", "S/G/_tokens/a.token-1.png")],
    );
    expect(parseArtRefs(JSON.parse(JSON.stringify(refs)), T)).toEqual(refs);
  });

  it("reads damaged tokens with defaults", () => {
    const refs = parseArtRefs(
      { tokens: [{ id: "t", artId: "a", relPath: "p.png", size: 300, crop: { zoom: 0 } }] },
      T,
    );
    expect(refs.tokens[0]).toMatchObject({
      size: 512,
      cells: 1,
      frame: { width: 0 },
      crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    });
  });
});

describe("resolveArtRefs", () => {
  const refs: ArtRefs = {
    arts: [
      { id: "old-same", relPath: "S/G/same.png", hash: "h1" },
      { id: "old-moved", relPath: "S/G/moved.png", hash: "h2" },
      { id: "old-gone", relPath: "S/G/gone.png", hash: "h3" },
      { id: "old-elsewhere", relPath: "S/G/elsewhere.png", hash: "h4" },
    ],
    tokens: [
      { ...token("t-same", "old-same", "S/G/_tokens/same.token-1.png") },
      { ...token("t-new", "old-moved", "S/G/_tokens/moved.token-1.png") },
      { ...token("t-nofile", "old-moved", "S/G/_tokens/moved.token-2.png") },
      { ...token("t-gone", "old-gone", "S/G/_tokens/gone.token-1.png") },
    ],
  };

  const localArts = [
    art("same", "S/G/same.png", { hash: "other content" }),
    art("moved", "S/H/renamed.png", { hash: "h2" }),
    art("twin", "S/H/moved.png", { hash: "h2" }),
    art("ghost", "S/G/elsewhere.png", { hash: "h4", missing: true }),
  ];
  const localTokens = [token("local-t", "same", "S/G/_tokens/same.token-1.png")];

  const result = resolveArtRefs(
    refs,
    localArts,
    localTokens,
    (p) => p === "S/G/_tokens/moved.token-1.png",
    counter(),
  );

  it("finds arts by path first, then by hash preferring the same file name", () => {
    expect(result.arts.get("old-same")).toBe("same");
    expect(result.arts.get("old-moved")).toBe("twin");
    expect(result.byPath).toBe(1);
    expect(result.byHash).toBe(1);
  });

  it("links a missing record at the same path but reports the file as not found", () => {
    expect(result.arts.get("old-elsewhere")).toBe("ghost");
    expect(result.arts.has("old-gone")).toBe(false);
    expect(result.notFound).toEqual(["S/G/gone.png", "S/G/elsewhere.png"]);
  });

  it("reuses token records, creates missing ones when the PNG is there", () => {
    expect(result.tokens.get("t-same")).toBe("local-t");
    expect(result.newTokens).toEqual([
      { ...token("new-1", "twin", "S/G/_tokens/moved.token-1.png") },
    ]);
    expect(result.tokens.get("t-new")).toBe("new-1");
    expect(result.tokens.has("t-nofile")).toBe(false);
    expect(result.tokens.has("t-gone")).toBe(false);
  });

  it("keeps a token only together with its art", () => {
    expect(resolvePictureLink({ artId: "old-same", tokenId: "t-same" }, result)).toEqual({
      artId: "same",
      tokenId: "local-t",
    });
    expect(resolvePictureLink({ artId: "old-gone", tokenId: "t-gone" }, result)).toEqual({
      artId: null,
      tokenId: null,
    });
    expect(resolvePictureLink({ artId: "old-moved", tokenId: "t-nofile" }, result)).toEqual({
      artId: "twin",
      tokenId: null,
    });
  });
});
