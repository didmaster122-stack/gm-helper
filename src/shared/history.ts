/** Undo/redo stack of immutable snapshots. */
export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

export const HISTORY_LIMIT = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records a new state; the oldest entries are dropped beyond `limit`. */
export function pushHistory<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  return { past: past.slice(Math.max(0, past.length - limit)), present: next, future: [] };
}

/** Changes the present state without a new undo step (continuing a brush stroke). */
export function replacePresent<T>(h: History<T>, next: T): History<T> {
  return next === h.present ? h : { ...h, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...future] = h.future;
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future };
}
