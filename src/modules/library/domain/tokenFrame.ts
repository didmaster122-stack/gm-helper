// Token frame: a coloured ring along the edge of the circle, inside the PNG.

export interface TokenFrame {
  /** "#rrggbb". */
  color: string;
  /** Ring thickness in percent of the token radius; 0 — no frame. */
  width: number;
}

export const MAX_FRAME_WIDTH = 20;
export const FRAME_COLORS = [
  "#c9a227",
  "#c0c0c0",
  "#1a1a1a",
  "#ffffff",
  "#b3261e",
  "#2f6fd6",
  "#2e8b57",
  "#7b3fb5",
] as const;
export const NO_FRAME: TokenFrame = { color: FRAME_COLORS[0], width: 0 };

const HEX = /^#[0-9a-f]{6}$/i;

/** Repairs a frame read from the database, a backup or saved preferences. */
export function normalizeFrame(color: unknown, width: unknown): TokenFrame {
  const w = typeof width === "number" && Number.isFinite(width) ? width : 0;
  return {
    color: typeof color === "string" && HEX.test(color) ? color.toLowerCase() : NO_FRAME.color,
    width: Math.min(MAX_FRAME_WIDTH, Math.max(0, w)),
  };
}

/** The ring on a token of `outputSize` pixels: outer and inner radius; null without a frame. */
export function frameRing(
  frame: TokenFrame,
  outputSize: number,
): { outer: number; inner: number } | null {
  if (frame.width <= 0) return null;
  const outer = outputSize / 2;
  return { outer, inner: outer * (1 - frame.width / 100) };
}
