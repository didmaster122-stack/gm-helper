export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Schema history. Never edit an applied migration: append a new one instead.
 * Foreign keys are not enforced (PRAGMA foreign_keys is per connection and the
 * plugin uses a pool), so repositories clean up dependent rows themselves.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "init",
    sql: `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE campaigns (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        system      TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        archived    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "arts",
    sql: `
      CREATE TABLE arts (
        id           TEXT PRIMARY KEY,
        rel_path     TEXT NOT NULL UNIQUE,
        system       TEXT,
        grp          TEXT,
        unsorted     INTEGER NOT NULL,
        file_name    TEXT NOT NULL,
        size         INTEGER NOT NULL,
        mtime        INTEGER NOT NULL,
        hash         TEXT,
        width        INTEGER,
        height       INTEGER,
        display_name TEXT,
        tags         TEXT NOT NULL DEFAULT '[]',
        missing      INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX arts_hash ON arts (hash);
    `,
  },
];
