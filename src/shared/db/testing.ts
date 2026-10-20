/// <reference types="node" />
// Test-only: an in-memory Db backed by Node's built-in SQLite. Never import from app code.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db, SqlParams } from "./types";

export function createMemoryDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  const bind = (params: SqlParams) => params as SQLInputValue[];
  return {
    raw,
    async execute(sql, params = []) {
      if (params.length === 0) {
        const before = raw.prepare("SELECT total_changes() AS n").get() as { n: number };
        raw.exec(sql);
        const after = raw.prepare("SELECT total_changes() AS n").get() as { n: number };
        return { rowsAffected: after.n - before.n };
      }
      const result = raw.prepare(sql).run(...bind(params));
      return { rowsAffected: Number(result.changes) };
    },
    async select<T>(sql: string, params: SqlParams = []) {
      return raw.prepare(sql).all(...bind(params)) as T[];
    },
  };
}
