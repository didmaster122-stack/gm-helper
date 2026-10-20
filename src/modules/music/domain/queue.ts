// Play order of the player queue (spec §6.3). Pure: the random source is passed in.

export type Repeat = "off" | "all" | "one";

/**
 * Indexes of the queue in play order. Shuffled orders start with `start`, so the
 * track the user picked plays first; plain orders are the list as is.
 */
export function makeOrder(
  length: number,
  start: number,
  shuffle: boolean,
  random: () => number = Math.random,
): number[] {
  const order = Array.from({ length }, (_, i) => i);
  if (!shuffle || length < 2) return order;
  const rest = order.filter((i) => i !== start);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j] as number, rest[i] as number];
  }
  return start >= 0 && start < length ? [start, ...rest] : rest;
}

/**
 * Next position in the order, or null when playback stops.
 * `manual`: the user pressed "next" — repeat-one does not hold them on the same track.
 */
export function nextPosition(
  pos: number,
  length: number,
  repeat: Repeat,
  manual: boolean,
): number | null {
  if (length === 0) return null;
  if (repeat === "one" && !manual) return pos;
  if (pos + 1 < length) return pos + 1;
  return repeat === "off" ? null : 0;
}

/** Previous position; at the start it wraps only when the list repeats. */
export function previousPosition(pos: number, length: number, repeat: Repeat): number | null {
  if (length === 0) return null;
  if (pos > 0) return pos - 1;
  return repeat === "off" ? null : length - 1;
}

/** "Previous" restarts the current track if it has played for a while. */
export const RESTART_THRESHOLD_S = 3;

/**
 * Re-ordering for a shuffle switch in the middle of playback: the current track keeps
 * playing and stays at the head; the rest follow in the new mode.
 */
export function reorder(
  order: readonly number[],
  pos: number,
  shuffle: boolean,
  random: () => number = Math.random,
): { order: number[]; pos: number } {
  const current = order[pos];
  if (current === undefined) return { order: [...order], pos: 0 };
  const length = order.length;
  if (shuffle) return { order: makeOrder(length, current, true, random), pos: 0 };
  return { order: makeOrder(length, current, false), pos: current };
}

/** Volume multiplier at time `t` of a fade from `from` to `to` lasting `duration` seconds. */
export function fadeGain(from: number, to: number, t: number, duration: number): number {
  if (duration <= 0 || t >= duration) return to;
  if (t <= 0) return from;
  return from + (to - from) * (t / duration);
}

export const CROSSFADE_MAX_S = 10;

export function clampCrossfade(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(CROSSFADE_MAX_S, Math.max(0, Math.round(seconds)));
}
