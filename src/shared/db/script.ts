import type { Db } from "./types";

/**
 * The SQL plugin runs each call on any connection of a pool, so a transaction
 * split over several calls is not reliable. Batched writes are therefore sent
 * as one script with values inlined as SQLite literals.
 */
export function sqlLiteral(value: string | number | boolean | null): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot store non-finite number ${value}`);
    return String(value);
  }
  // NUL would cut the statement short in SQLite's C API.
  if (value.includes("\u0000")) throw new Error("Strings must not contain NUL characters");
  return `'${value.replace(/'/g, "''")}'`;
}

/** Runs statements atomically in one call; splits very large batches into several transactions. */
export async function runScript(db: Db, statements: readonly string[], chunkSize = 500) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    const script = ["BEGIN;", ...chunk.map((s) => `${s};`), "COMMIT;"].join("\n");
    try {
      await db.execute(script);
    } catch (error) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}
