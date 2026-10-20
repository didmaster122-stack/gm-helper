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
  {
    version: 8,
    name: "timeline",
    sql: `
      -- One row per campaign that has opened its timeline.
      CREATE TABLE timelines (
        campaign_id     TEXT PRIMARY KEY,
        session_count   INTEGER NOT NULL,
        current_session INTEGER
      );

      -- kind: main | personal | custom. Personal lanes belong to a player character.
      CREATE TABLE timeline_lanes (
        id           TEXT PRIMARY KEY,
        campaign_id  TEXT NOT NULL,
        kind         TEXT NOT NULL,
        name         TEXT NOT NULL DEFAULT '',
        character_id TEXT,
        sort         INTEGER NOT NULL,
        hidden       INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX timeline_lanes_campaign ON timeline_lanes (campaign_id);

      -- session NULL means "Future".
      CREATE TABLE timeline_events (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        lane_id     TEXT NOT NULL,
        session     INTEGER,
        sort        INTEGER NOT NULL,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        game_date   TEXT NOT NULL DEFAULT '',
        importance  TEXT NOT NULL,
        status      TEXT NOT NULL,
        characters  TEXT NOT NULL DEFAULT '[]',
        tags        TEXT NOT NULL DEFAULT '[]',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX timeline_events_campaign ON timeline_events (campaign_id);

      -- Cause -> consequence.
      CREATE TABLE timeline_links (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        from_id     TEXT NOT NULL,
        to_id       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX timeline_links_campaign ON timeline_links (campaign_id);
    `,
  },
  {
    version: 9,
    name: "timeline time markers",
    sql: `
      -- In-game time marks on the right of the timeline. level: 1 (coarse) .. 3 (fine).
      -- Markers share the order inside a session (sort) with the events.
      CREATE TABLE timeline_markers (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        label       TEXT NOT NULL,
        level       INTEGER NOT NULL,
        session     INTEGER,
        sort        INTEGER NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX timeline_markers_campaign ON timeline_markers (campaign_id);
    `,
  },
  {
    version: 10,
    name: "music tracks",
    sql: `
      -- Index of the music folder (Category / Collection / file), like arts.
      -- duration_ms is filled in after the first read of the file.
      CREATE TABLE tracks (
        id           TEXT PRIMARY KEY,
        rel_path     TEXT NOT NULL UNIQUE,
        category     TEXT,
        collection   TEXT,
        unsorted     INTEGER NOT NULL,
        file_name    TEXT NOT NULL,
        size         INTEGER NOT NULL,
        mtime        INTEGER NOT NULL,
        hash         TEXT,
        duration_ms  INTEGER,
        display_name TEXT,
        tags         TEXT NOT NULL DEFAULT '[]',
        missing      INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX tracks_hash ON tracks (hash);
    `,
  },
  {
    version: 11,
    name: "token size and frame",
    sql: `
      -- cells: creature size (1..4 cells per side); frame_width: percent of the radius, 0 = none.
      ALTER TABLE tokens ADD COLUMN cells INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE tokens ADD COLUMN frame_color TEXT NOT NULL DEFAULT '#c9a227';
      ALTER TABLE tokens ADD COLUMN frame_width REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 12,
    name: "game master notes",
    sql: `
      -- kind: 'text' (content is the editor document) or 'pdf' (file_path is the PDF).
      -- plain_text: the text of the document, for search. Paths are relative to the library.
      CREATE TABLE notes (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        kind        TEXT NOT NULL,
        title       TEXT NOT NULL,
        content     TEXT NOT NULL DEFAULT '',
        plain_text  TEXT NOT NULL DEFAULT '',
        file_path   TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX notes_campaign ON notes (campaign_id);

      CREATE TABLE note_tags (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX note_tags_campaign ON note_tags (campaign_id);

      CREATE TABLE note_tag_links (
        note_id TEXT NOT NULL,
        tag_id  TEXT NOT NULL,
        PRIMARY KEY (note_id, tag_id)
      );
      CREATE INDEX note_tag_links_tag ON note_tag_links (tag_id);
    `,
  },
];
