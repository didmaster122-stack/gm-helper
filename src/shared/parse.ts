// Lenient readers for JSON files written by the app (backups, map files).
// Each returns a fallback instead of throwing, so one damaged field does not lose the whole file.

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const readString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

export const readNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export const readInteger = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

export const readBoolean = (v: unknown): boolean => v === true;

export const readStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

export const readNullableString = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;

export function readOneOf<T extends string | number>(
  values: readonly T[],
  v: unknown,
  fallback: T,
): T {
  return values.find((x) => x === v) ?? fallback;
}

/** Records of an array; non-objects are dropped. */
export const readRecords = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(isRecord) : [];

/** ISO date from the file, or `fallback` when absent or malformed. */
export function readDate(v: unknown, fallback: string): string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback;
}
