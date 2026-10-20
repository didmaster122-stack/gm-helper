import Database from "@tauri-apps/plugin-sql";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { migrate } from "./migrate";
import { migrations } from "./migrations";
import type { Db } from "./types";

/** Relative to the app config dir (%APPDATA%/com.gmhelper.app on Windows). */
const DB_FILE = "gm-helper.db";

let instance: Promise<Db> | null = null;

function wrap(database: Database): Db {
  return {
    async execute(sql, params = []) {
      const result = await database.execute(sql, [...params]);
      return { rowsAffected: result.rowsAffected };
    },
    select<T>(sql: string, params: readonly unknown[] = []) {
      return database.select<T[]>(sql, [...params]);
    },
  };
}

async function backupBeforeMigration(db: Db, version: number): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = await join(await appConfigDir(), `gm-helper.backup-v${version}-${stamp}.db`);
  // VACUUM INTO writes a consistent snapshot even while the database is open.
  await db.execute("VACUUM INTO ?", [target]);
}

async function open(): Promise<Db> {
  const db = wrap(await Database.load(`sqlite:${DB_FILE}`));
  await migrate(db, migrations, { backup: (version) => backupBeforeMigration(db, version) });
  return db;
}

/** Opens the app database once and brings its schema up to date. */
export function getDb(): Promise<Db> {
  instance ??= open().catch((error: unknown) => {
    instance = null;
    throw error;
  });
  return instance;
}
