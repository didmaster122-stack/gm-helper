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
  {
    version: 3,
    name: "tokens",
    sql: `
      CREATE TABLE tokens (
        id         TEXT PRIMARY KEY,
        art_id     TEXT NOT NULL,
        rel_path   TEXT NOT NULL,
        size       INTEGER NOT NULL,
        center_x   REAL NOT NULL,
        center_y   REAL NOT NULL,
        zoom       REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX tokens_art ON tokens (art_id);
    `,
  },
  {
    version: 4,
    name: "battlemaps",
    sql: `
      CREATE TABLE battlemaps (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX battlemaps_campaign ON battlemaps (campaign_id);

      -- Custom cell types (builtin = 0) and colour overrides of built-in ones (builtin = 1).
      CREATE TABLE cell_types (
        id           TEXT PRIMARY KEY,
        builtin      INTEGER NOT NULL,
        name         TEXT NOT NULL DEFAULT '',
        color        TEXT NOT NULL,
        symbol       TEXT NOT NULL DEFAULT '',
        blocks_move  INTEGER NOT NULL DEFAULT 0,
        blocks_sight TEXT NOT NULL DEFAULT 'no',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
    `,
  },
  {
    version: 5,
    name: "cell type comments",
    sql: `ALTER TABLE cell_types ADD COLUMN comment TEXT NOT NULL DEFAULT '';`,
  },
  {
    version: 6,
    name: "map objects, pictures, tags and templates",
    sql: `
      -- Custom picture of a cell type: a downscaled copy as a data URL ('' = none).
      ALTER TABLE cell_types ADD COLUMN image TEXT NOT NULL DEFAULT '';

      CREATE TABLE map_objects (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        width        INTEGER NOT NULL,
        height       INTEGER NOT NULL,
        color        TEXT NOT NULL,
        symbol       TEXT NOT NULL DEFAULT '',
        image        TEXT NOT NULL DEFAULT '',
        blocks_move  INTEGER NOT NULL DEFAULT 0,
        blocks_sight INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      ALTER TABLE battlemaps ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
      -- Small picture for the gallery as a data URL ('' until the map is saved once).
      ALTER TABLE battlemaps ADD COLUMN preview TEXT NOT NULL DEFAULT '';
      -- Templates are shared by all campaigns and have campaign_id = ''.
      ALTER TABLE battlemaps ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0;
    `,
  },
];
