// Token files: "<art base name>.token-<n>.png" in the "_tokens" folder next to the art.
import { joinRel, parentRel, splitExtension, suggestFreeName } from "./paths";

export const TOKENS_FOLDER = "_tokens";

/** Folder (relative to the library root) for tokens of the art at `artRelPath`. */
export function tokensFolder(artRelPath: string): string {
  return joinRel(parentRel(artRelPath), TOKENS_FOLDER);
}

export function tokenFileName(artBase: string, n: number): string {
  return `${artBase}.token-${n}.png`;
}

const NUMBER = /\.token-(\d+)\.png$/i;

/** Number of the token file, or null if the name does not follow the pattern. */
export function tokenNumber(fileName: string): number | null {
  const m = NUMBER.exec(fileName);
  return m?.[1] ? Number(m[1]) : null;
}

function baseOf(fileName: string): string | null {
  const m = NUMBER.exec(fileName);
  return m ? fileName.slice(0, m.index) : null;
}

/** Next free "<base>.token-<n>.png": one past the highest number already used for this base. */
export function nextTokenFileName(artBase: string, taken: Iterable<string>): string {
  const base = artBase.toLowerCase();
  let max = 0;
  for (const name of taken) {
    const n = tokenNumber(name);
    if (n !== null && baseOf(name)?.toLowerCase() === base) max = Math.max(max, n);
  }
  return tokenFileName(artBase, max + 1);
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
    const n = tokenNumber(fileName);
    let name: string;
    if (n === null) name = suggestFreeName(fileName, used);
    else {
      name = tokenFileName(newBase, n);
      if (isUsed(name)) name = nextTokenFileName(newBase, used);
    }
    used.push(name);
    return name;
  });
}

/** "lich" for the art "lich.png". */
export function artBaseName(artFileName: string): string {
  return splitExtension(artFileName).base;
}
