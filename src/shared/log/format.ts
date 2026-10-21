// Pure part of the error log: how a console call or an uncaught error becomes text.

/** Above this size the log is moved to errors.old.log and a new one is started. */
export const MAX_LOG_BYTES = 1024 * 1024;

function describe(value: unknown): string {
  if (value instanceof Error) {
    const head = value.stack?.includes(value.message)
      ? value.stack
      : `${value.name}: ${value.message}\n${value.stack ?? ""}`.trimEnd();
    return value.cause === undefined ? head : `${head}\nCaused by: ${describe(value.cause)}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** One log entry: "[2026-10-21T19:05:09.000Z] text", the following lines indented. */
export function formatLogEntry(now: Date, values: readonly unknown[]): string {
  const text = values.map(describe).join(" ");
  return `[${now.toISOString()}] ${text.replace(/\n/g, "\n    ")}\n`;
}
