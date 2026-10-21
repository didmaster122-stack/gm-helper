/**
 * Hue (0–359) of the gradient cover of a campaign without an art. It comes from the name, so a
 * campaign keeps its colour, and different names get different colours.
 */
export function coverHue(name: string): number {
  let hash = 0;
  for (const ch of name.trim().toLocaleLowerCase("ru")) {
    hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}
