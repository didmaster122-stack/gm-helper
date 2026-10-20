// Size, resolution and frame of the last saved token: the next new token starts with them.
import { isRecord } from "../../shared/parse";
import {
  DEFAULT_CREATURE_SIZE,
  DEFAULT_TOKEN_SIZE,
  isCreatureSize,
  isTokenSize,
} from "./domain/tokenCrop";
import { NO_FRAME, normalizeFrame } from "./domain/tokenFrame";
import type { TokenParams } from "./tokenService";

const KEY = "gm-helper.tokenDefaults";

export type TokenDefaults = Omit<TokenParams, "crop">;

const fallback: TokenDefaults = {
  size: DEFAULT_TOKEN_SIZE,
  cells: DEFAULT_CREATURE_SIZE,
  frame: NO_FRAME,
};

export function loadTokenDefaults(): TokenDefaults {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!isRecord(raw)) return fallback;
    const frame = isRecord(raw.frame) ? raw.frame : {};
    return {
      size: typeof raw.size === "number" && isTokenSize(raw.size) ? raw.size : fallback.size,
      cells:
        typeof raw.cells === "number" && isCreatureSize(raw.cells) ? raw.cells : fallback.cells,
      frame: normalizeFrame(frame.color, frame.width),
    };
  } catch {
    return fallback;
  }
}

export function saveTokenDefaults({ size, cells, frame }: TokenDefaults): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ size, cells, frame }));
  } catch {
    // Not remembered; the editor still works.
  }
}
