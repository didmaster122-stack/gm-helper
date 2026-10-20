import type { Db } from "./types";
import type { Migration } from "./migrations";

export interface MigrateOptions {
  /** Called once before pending migrations run on a non-empty database. */
  backup?: (currentVersion: number) => Promise<void>;
  now?: () => Date;
}

export interface MigrateResult {
  fromVersion: number;
  toVersion: number;
  applied: number[];
}

export async function getSchemaVersion(db: Db): Promise<number> {
  const rows = await db.select<{ version: number | null }>(
    "SELECT MAX(version) AS version FROM schema_migrations",
  );
  return rows[0]?.version ?? 0;
}

export function validateMigrations(list: readonly Migration[]): void {
  list.forEach((m, i) => {
    if (!Number.isInteger(m.version) || m.version < 1) {
      throw new Error(`Migration "${m.name}" has invalid version ${m.version}`);
    }
    const prev = list[i - 1];
    if (prev && m.version <= prev.version) {
      throw new Error(
        `Migration versions must be strictly ascending (${prev.version} → ${m.version})`,
      );
    }
  });
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Applies pending migrations. Each migration and its schema_migrations row
 * are sent as one script inside a transaction, so a failed migration leaves
 * the database at the previous version.
 */
export async function migrate(
  db: Db,
  list: readonly Migration[],
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  validateMigrations(list);
  const now = options.now ?? (() => new Date());

  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );

  const fromVersion = await getSchemaVersion(db);
  const pending = list.filter((m) => m.version > fromVersion);
  if (pending.length === 0) {
    return { fromVersion, toVersion: fromVersion, applied: [] };
  }

  if (fromVersion > 0 && options.backup) {
    await options.backup(fromVersion);
  }

  const applied: number[] = [];
  for (const m of pending) {
    const script = [
      "BEGIN;",
      m.sql,
      `;INSERT INTO schema_migrations (version, name, applied_at) VALUES (${m.version}, ${quote(m.name)}, ${quote(now().toISOString())});`,
      "COMMIT;",
    ].join("\n");
    try {
      await db.execute(script);
    } catch (error) {
      await db.execute("ROLLBACK").catch(() => undefined);
      throw new Error(`Migration ${m.version} "${m.name}" failed: ${String(error)}`, {
        cause: error,
      });
    }
    applied.push(m.version);
  }

  return { fromVersion, toVersion: applied[applied.length - 1] ?? fromVersion, applied };
}
