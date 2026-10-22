import Database from "@tauri-apps/plugin-sql";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { createFolder, listFiles, overwriteAppFile, removeAppFile } from "../fs";
import { backupFileName, parseBackupName, planAutoBackup, type BackupKind } from "./backups";
import { migrate } from "./migrate";
import { migrations } from "./migrations";
import type { Db } from "./types";

/** Relative to the app config dir (%APPDATA%/com.gmhelper.app on Windows). */
const DB_FILE = "gm-helper.db";
/** Daily copies and copies made before a restore, next to the database. */
const BACKUPS_DIR = "backups";

let instance: Promise<Db> | null = null;
let connection: Database | null = null;

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
  connection = await Database.load(`sqlite:${DB_FILE}`);
  const db = wrap(connection);
  await migrate(db, migrations, { backup: (version) => backupBeforeMigration(db, version) });
  // A failed copy must not keep the app from starting; the error goes to the log.
  void makeDailyBackup(db).catch((error: unknown) =>
    console.error("Daily database copy failed", error),
  );
  return db;
}

/** Folder with the database copies; created on demand. */
export async function backupsDir(): Promise<string> {
  const dir = await join(await appConfigDir(), BACKUPS_DIR);
  await createFolder(dir);
  return dir;
}

async function makeDailyBackup(db: Db): Promise<void> {
  const dir = await backupsDir();
  const plan = planAutoBackup(
    (await listFiles(dir)).map((f) => f.name),
    new Date(),
  );
  if (plan.create) await db.execute("VACUUM INTO ?", [await join(dir, plan.create)]);
  for (const name of plan.remove) await removeAppFile(await join(dir, name));
}

export interface DbBackup {
  path: string;
  kind: BackupKind;
  /** ISO 8601, UTC. */
  createdAt: string;
  size: number;
}

/** Copies the app made, newest first. */
export async function listDbBackups(): Promise<DbBackup[]> {
  const result: DbBackup[] = [];
  for (const file of await listFiles(await backupsDir())) {
    const parsed = parseBackupName(file.name);
    if (!parsed) continue;
    result.push({
      path: file.path,
      kind: parsed.kind,
      createdAt: parsed.date.toISOString(),
      size: file.size,
    });
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Replaces the database with a copy. The current database is saved as a "before restore"
 * copy first. The connection is closed, so the caller must reload the app right after.
 */
export async function restoreDbBackup(path: string): Promise<void> {
  const db = await getDb();
  const dir = await backupsDir();
  await db.execute("VACUUM INTO ?", [
    await join(dir, backupFileName("before-restore", new Date())),
  ]);
  await connection?.close();
  connection = null;
  instance = null;
  const target = await join(await appConfigDir(), DB_FILE);
  // The pool works in WAL mode: a journal left from the old database would be applied
  // to the restored one and corrupt it.
  await removeAppFile(`${target}-wal`);
  await removeAppFile(`${target}-shm`);
  await overwriteAppFile(path, target);
}

/** Opens the app database once and brings its schema up to date. */
export function getDb(): Promise<Db> {
  instance ??= open().catch((error: unknown) => {
    instance = null;
    throw error;
  });
  return instance;
}
