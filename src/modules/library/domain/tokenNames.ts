// Token files: "<art base name>.token-<n>.png" in the "_tokens" folder next to the art;
// tokens larger than one cell carry their size: "<art>.token-<n>-2x2.png".
import type { CreatureSize } from "./tokenCrop";
import { joinRel, parentRel, splitExtension, suggestFreeName } from "./paths";

export const TOKENS_FOLDER = "_tokens";

/** Folder (relative to the library root) for tokens of the art at `artRelPath`. */
export function tokensFolder(artRelPath: string): string {
  return joinRel(parentRel(artRelPath), TOKENS_FOLDER);
}

export function tokenFileName(artBase: string, n: number, cells: number = 1): string {
  return cells > 1 ? `${artBase}.token-${n}-${cells}x${cells}.png` : `${artBase}.token-${n}.png`;
}

const PATTERN = /\.token-(\d+)(?:-(\d+)x\2)?\.png$/i;

interface TokenNameParts {
  base: string;
  n: number;
  /** Size written in the name; 1 when there is none. */
  cells: number;
}

function parseTokenName(fileName: string): TokenNameParts | null {
  const m = PATTERN.exec(fileName);
  if (!m?.[1]) return null;
  return { base: fileName.slice(0, m.index), n: Number(m[1]), cells: m[2] ? Number(m[2]) : 1 };
}

/** Number of the token file, or null if the name does not follow the pattern. */
export function tokenNumber(fileName: string): number | null {
  return parseTokenName(fileName)?.n ?? null;
}

/**
 * Next free "<base>.token-<n>.png" (with the size for larger tokens): one past the highest
 * number already used for this base, whatever the size of those tokens.
 */
export function nextTokenFileName(
  artBase: string,
  taken: Iterable<string>,
  cells: number = 1,
): string {
  const base = artBase.toLowerCase();
  let max = 0;
  for (const name of taken) {
    const parts = parseTokenName(name);
    if (parts && parts.base.toLowerCase() === base) max = Math.max(max, parts.n);
  }
  return tokenFileName(artBase, max + 1, cells);
}

/**
 * Name of the token file after its size changed to `cells`: same base and number, new size
 * suffix. Names not following the pattern are kept.
 */
export function resizedTokenFileName(fileName: string, cells: CreatureSize): string {
  const parts = parseTokenName(fileName);
  return parts ? tokenFileName(parts.base, parts.n, cells) : fileName;
}

/**
 * New names for token files that follow their art to `newBase`: the number is
 * kept when the name is free in the target folder, otherwise the next free one
 * is used. `taken` — names already in the target folder, not counting the files
 * being renamed. Files not following the pattern keep their name (made unique).
 */
export function retargetTokenNames(
  fileNames: readonly string[],
  newBase: string,
  taken: Iterable<string>,
): string[] {
  const used = [...taken];
  const isUsed = (name: string) => used.some((u) => u.toLowerCase() === name.toLowerCase());
  return fileNames.map((fileName) => {
    const parts = parseTokenName(fileName);
    let name: string;
    if (parts === null) name = suggestFreeName(fileName, used);
    else {
      name = tokenFileName(newBase, parts.n, parts.cells);
      if (isUsed(name)) name = nextTokenFileName(newBase, used, parts.cells);
    }
    used.push(name);
    return name;
  });
}

/** "lich" for the art "lich.png". */
export function artBaseName(artFileName: string): string {
  return splitExtension(artFileName).base;
}
