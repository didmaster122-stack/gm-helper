/** Positional parameters bound to `?` placeholders. */
export type SqlParams = readonly unknown[];

/**
 * Minimal database interface used by migrations and repositories.
 * The Tauri SQL plugin implements it in the app; tests use node:sqlite.
 */
export interface Db {
  /** Runs a statement (or a script of several statements when `params` is empty). */
  execute(sql: string, params?: SqlParams): Promise<{ rowsAffected: number }>;
  select<T>(sql: string, params?: SqlParams): Promise<T[]>;
}
