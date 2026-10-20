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
  {
    version: 7,
    name: "characters, factions and relations",
    sql: `
      CREATE TABLE characters (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        player      TEXT NOT NULL DEFAULT '',
        role        TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        motivation  TEXT NOT NULL DEFAULT '',
        secrets     TEXT NOT NULL DEFAULT '',
        tags        TEXT NOT NULL DEFAULT '[]',
        -- Ordered faction ids; the first one is the main faction.
        factions    TEXT NOT NULL DEFAULT '[]',
        art_id      TEXT,
        token_id    TEXT,
        x           REAL NOT NULL DEFAULT 0,
        y           REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX characters_campaign ON characters (campaign_id);

      CREATE TABLE factions (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        art_id      TEXT,
        token_id    TEXT,
        -- Position of the frame when the faction has no members on the graph.
        x           REAL NOT NULL DEFAULT 0,
        y           REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX factions_campaign ON factions (campaign_id);

      -- Ends are character or faction ids.
      CREATE TABLE relations (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        from_id     TEXT NOT NULL,
        to_id       TEXT NOT NULL,
        type_id     TEXT NOT NULL,
        mutual      INTEGER NOT NULL DEFAULT 0,
        label       TEXT NOT NULL DEFAULT '',
        note        TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX relations_campaign ON relations (campaign_id);

      -- App-wide. Built-in types have name '' (the name comes from i18n) until renamed.
      CREATE TABLE relation_types (
        id         TEXT PRIMARY KEY,
        builtin    INTEGER NOT NULL,
        name       TEXT NOT NULL DEFAULT '',
        color      TEXT NOT NULL,
        line_style TEXT NOT NULL,
        sort       INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO relation_types (id, builtin, color, line_style, sort, created_at, updated_at) VALUES
        ('alliance',   1, '#4f9fd8', 'solid',  1,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('friendship', 1, '#5cb85c', 'solid',  2,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('enmity',     1, '#d0574f', 'solid',  3,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('rivalry',    1, '#e08a3c', 'dashed', 4,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('love',       1, '#e06fa8', 'solid',  5,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('kinship',    1, '#a98bdb', 'solid',  6,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('service',    1, '#c9a24a', 'dashed', 7,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('debt',       1, '#8fb3a0', 'dotted', 8,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('fear',       1, '#9c6b5a', 'dotted', 9,  '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
        ('unknown',    1, '#8a8c99', 'dashed', 10, '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z');
    `,
  },
];
