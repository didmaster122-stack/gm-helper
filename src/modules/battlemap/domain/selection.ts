export type SelectMode = "replace" | "add" | "toggle";

/** Shift adds to the selection, Ctrl toggles, a plain click or frame replaces it. */
export function selectModeFor(e: { shiftKey: boolean; ctrlKey: boolean }): SelectMode {
  if (e.ctrlKey) return "toggle";
  if (e.shiftKey) return "add";
  return "replace";
}

export function applySelection(
  current: ReadonlySet<number>,
  cells: readonly number[],
  mode: SelectMode,
): Set<number> {
  if (mode === "replace") return new Set(cells);
  const next = new Set(current);
  for (const c of cells) {
    if (mode === "add" || !next.has(c)) next.add(c);
    else next.delete(c);
  }
  return next;
}
