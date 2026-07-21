-- iqm-ds-sync local store schema (Phase 3).
-- Source-of-truth layer: Phase 1/2 write here, Phase 5+ read from here.
-- All CREATEs are IF NOT EXISTS so this file is safe to run on every open.

PRAGMA foreign_keys = ON;

-- A snapshot is one capture of the design system at a point in time.
CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT    NOT NULL,          -- ISO string: when the snapshot was taken
  source      TEXT    NOT NULL,          -- "component_extract" | "token_plugin" | "manual"
  description TEXT,                       -- optional notes on what changed
  created_at  INTEGER NOT NULL           -- unix ms, for sorting
);

-- Components captured in a given snapshot (shape mirrors Phase 1 extraction).
CREATE TABLE IF NOT EXISTS components (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id       INTEGER NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
  componentId       TEXT    NOT NULL,     -- Figma node id (unique per snapshot)
  name              TEXT,
  page              TEXT,                  -- page it lives on
  description       TEXT,                  -- nullable
  status            TEXT,                  -- "Shipped"|"WIP"|"Deprecated"|"Foundation"|NULL
  variantProperties TEXT,                  -- JSON (stringified array/object)
  lastModified      TEXT                   -- ISO timestamp
);

-- Tokens captured in a given snapshot (shape mirrors Phase 2 DTCG output).
CREATE TABLE IF NOT EXISTS tokens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id    INTEGER NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
  tokenId        TEXT    NOT NULL,         -- Figma variable id (unique per snapshot)
  tokenPath      TEXT,                     -- e.g. "primitives/color/blue/600" (searchable)
  layer          TEXT,                     -- "Primitives"|"Global Alias"|"System Alias"|"Component"
  "$value"       TEXT,                     -- resolved value or alias reference
  "$type"        TEXT,                     -- "color"|"dimension"|"duration"|...
  "$description" TEXT,                     -- nullable
  modes          TEXT,                     -- JSON (stringified array of mode names)
  "$extensions"  TEXT                      -- JSON (stringified com.iqm.figma metadata)
);

-- Unique per snapshot => also powers ON CONFLICT upserts in local-db.js.
CREATE UNIQUE INDEX IF NOT EXISTS idx_components_cid_snap ON components(componentId, snapshot_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_tid_snap     ON tokens(tokenId, snapshot_id);

-- Secondary indexes for common read paths (Phase 5 diff, Phase 6 docs).
CREATE INDEX IF NOT EXISTS idx_components_snap ON components(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_tokens_snap     ON tokens(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_tokens_layer    ON tokens(layer, snapshot_id);
