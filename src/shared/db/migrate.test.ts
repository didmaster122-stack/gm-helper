import { describe, expect, it, vi } from "vitest";
import { getSchemaVersion, migrate, validateMigrations } from "./migrate";
import { migrations, type Migration } from "./migrations";
import { createMemoryDb } from "./testing";

const sample: Migration[] = [
  { version: 1, name: "one", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);" },
  { version: 2, name: "two's", sql: "CREATE TABLE b (id INTEGER PRIMARY KEY);" },
];

describe("migrate", () => {
  it("applies all migrations to an empty database without a backup", async () => {
    const db = createMemoryDb();
    const backup = vi.fn(async () => undefined);

    const result = await migrate(db, sample, { backup });

    expect(result).toEqual({ fromVersion: 0, toVersion: 2, applied: [1, 2] });
    expect(backup).not.toHaveBeenCalled();
    expect(await getSchemaVersion(db)).toBe(2);
    const names = await db.select<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY version",
    );
    expect(names.map((r) => r.name)).toEqual(["one", "two's"]);
  });

  it("is a no-op when up to date", async () => {
    const db = createMemoryDb();
    await migrate(db, sample);
    const backup = vi.fn(async () => undefined);

    const result = await migrate(db, sample, { backup });

    expect(result.applied).toEqual([]);
    expect(backup).not.toHaveBeenCalled();
  });

  it("backs up once before applying pending migrations to an existing database", async () => {
    const db = createMemoryDb();
    await migrate(db, sample.slice(0, 1));
    const backup = vi.fn(async () => undefined);

    const result = await migrate(db, sample, { backup });

    expect(result).toEqual({ fromVersion: 1, toVersion: 2, applied: [2] });
    expect(backup).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("rolls back a failed migration and keeps the previous version", async () => {
    const db = createMemoryDb();
    const broken: Migration[] = [
      sample[0]!,
      { version: 2, name: "broken", sql: "CREATE TABLE c (id INTEGER); THIS IS NOT SQL;" },
    ];

    await expect(migrate(db, broken)).rejects.toThrow(/Migration 2 "broken" failed/);

    expect(await getSchemaVersion(db)).toBe(1);
    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'c'",
    );
    expect(tables).toEqual([]);
  });

  it("rejects out-of-order versions", () => {
    expect(() => validateMigrations([sample[1]!, sample[0]!])).toThrow(/ascending/);
  });

  it("applies the real app migrations", async () => {
    const db = createMemoryDb();
    await migrate(db, migrations);
    expect(await getSchemaVersion(db)).toBe(migrations[migrations.length - 1]!.version);
  });
});
