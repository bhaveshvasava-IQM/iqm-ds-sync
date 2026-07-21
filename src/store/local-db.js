// iqm-ds-sync local store (Phase 3).
//
// A thin, storage-agnostic interface over SQLite. The functions below are the
// contract; the SQLite bits are an implementation detail. A Firebase/Supabase
// backend could expose the same functions (see docs/STORE.md).
//
// All functions are synchronous — they return data directly or throw an Error
// with context (never a raw SQLite error).

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, "db.sqlite");
const SCHEMA_PATH = join(__dirname, "schema.sql");

let _db = null;

/**
 * Lazily open (and, if needed, create + initialize) the database. The path is
 * read from IQM_DB_PATH at first use so tests can point at a temp file. If the
 * file doesn't exist, better-sqlite3 creates it and we run schema.sql.
 */
function getDb() {
  if (_db) return _db;
  const path = process.env.IQM_DB_PATH || DEFAULT_DB_PATH;
  try {
    _db = new Database(path);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    const schema = readFileSync(SCHEMA_PATH, "utf8");
    _db.exec(schema); // all IF NOT EXISTS — idempotent
  } catch (err) {
    _db = null;
    throw new Error(`couldn't open/initialize the store at "${path}": ${err.message}`);
  }
  return _db;
}

/** Close the singleton (mainly for tests / clean shutdown). */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// --- helpers -------------------------------------------------------------

function latestSnapshotId(db) {
  const row = db.prepare("SELECT snapshot_id FROM snapshots ORDER BY created_at DESC LIMIT 1").get();
  return row ? row.snapshot_id : null;
}

function safeParse(json, fallback) {
  if (json == null) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function rowToComponent(r) {
  return {
    id: r.id,
    snapshot_id: r.snapshot_id,
    componentId: r.componentId,
    name: r.name,
    page: r.page,
    description: r.description,
    status: r.status,
    variantProperties: safeParse(r.variantProperties, {}),
    lastModified: r.lastModified,
  };
}

function rowToToken(r) {
  return {
    id: r.id,
    snapshot_id: r.snapshot_id,
    tokenId: r.tokenId,
    tokenPath: r.tokenPath,
    layer: r.layer,
    $value: r["$value"],
    $type: r["$type"],
    $description: r["$description"],
    modes: safeParse(r.modes, []),
    $extensions: safeParse(r["$extensions"], null),
  };
}

// Normalize an incoming token object (Phase 2 leaf token OR an already-flat
// row) into the columns we store. Falls back to $extensions.com.iqm.figma for
// fields not present at the top level.
function toTokenRow(snapshot_id, t) {
  const ext = t.$extensions && t.$extensions["com.iqm.figma"] ? t.$extensions["com.iqm.figma"] : null;
  const tokenId = t.tokenId != null ? t.tokenId : ext && ext.variableId;
  if (tokenId == null) {
    throw new Error(`token missing tokenId (and no $extensions.com.iqm.figma.variableId): ${JSON.stringify(t).slice(0, 120)}`);
  }
  const layer = t.layer != null ? t.layer : ext ? ext.collectionName : null;
  const modes = t.modes != null ? t.modes : ext ? ext.modes : null;
  let value = null;
  if (t.$value !== undefined && t.$value !== null) {
    value = typeof t.$value === "object" ? JSON.stringify(t.$value) : String(t.$value);
  }
  return {
    snapshot_id,
    tokenId: String(tokenId),
    tokenPath: t.tokenPath != null ? t.tokenPath : null,
    layer: layer != null ? layer : null,
    value,
    type: t.$type != null ? t.$type : null,
    description: t.$description != null ? t.$description : null,
    modes: modes != null ? JSON.stringify(modes) : null,
    extensions: t.$extensions != null ? JSON.stringify(t.$extensions) : null,
  };
}

function assertSnapshotExists(db, snapshot_id) {
  const row = db.prepare("SELECT 1 FROM snapshots WHERE snapshot_id = ?").get(snapshot_id);
  if (!row) throw new Error(`snapshot ${snapshot_id} does not exist`);
}

// --- public interface ----------------------------------------------------

/** (a) Create a snapshot row; returns the new snapshot_id. */
function createSnapshot(source, description = null) {
  if (!source) throw new Error("createSnapshot: `source` is required");
  const db = getDb();
  try {
    const info = db
      .prepare("INSERT INTO snapshots (timestamp, source, description, created_at) VALUES (?, ?, ?, ?)")
      .run(new Date().toISOString(), source, description, Date.now());
    return Number(info.lastInsertRowid);
  } catch (err) {
    throw new Error(`couldn't create snapshot (source="${source}"): ${err.message}`);
  }
}

/** (b) Upsert components into a snapshot; returns count processed. */
function writeComponents(snapshot_id, componentsArray) {
  const db = getDb();
  if (!Array.isArray(componentsArray)) throw new Error("writeComponents: expected an array of components");
  assertSnapshotExists(db, snapshot_id);

  const stmt = db.prepare(`
    INSERT INTO components (snapshot_id, componentId, name, page, description, status, variantProperties, lastModified)
    VALUES (@snapshot_id, @componentId, @name, @page, @description, @status, @variantProperties, @lastModified)
    ON CONFLICT(componentId, snapshot_id) DO UPDATE SET
      name = excluded.name,
      page = excluded.page,
      description = excluded.description,
      status = excluded.status,
      variantProperties = excluded.variantProperties,
      lastModified = excluded.lastModified
  `);

  const tx = db.transaction((rows) => {
    let n = 0;
    for (const c of rows) {
      if (c.componentId == null) {
        throw new Error(`component missing componentId: ${JSON.stringify(c).slice(0, 120)}`);
      }
      stmt.run({
        snapshot_id,
        componentId: String(c.componentId),
        name: c.name != null ? c.name : null,
        page: c.page != null ? c.page : null,
        description: c.description != null ? c.description : null,
        status: c.status != null ? c.status : null,
        variantProperties: c.variantProperties != null ? JSON.stringify(c.variantProperties) : null,
        lastModified: c.lastModified != null ? c.lastModified : null,
      });
      n++;
    }
    return n;
  });

  try {
    return tx(componentsArray);
  } catch (err) {
    throw new Error(`couldn't write components to snapshot ${snapshot_id}: ${err.message}`);
  }
}

/** (c) Upsert tokens into a snapshot; returns count processed. */
function writeTokens(snapshot_id, tokensArray) {
  const db = getDb();
  if (!Array.isArray(tokensArray)) throw new Error("writeTokens: expected an array of tokens");
  assertSnapshotExists(db, snapshot_id);

  const stmt = db.prepare(`
    INSERT INTO tokens (snapshot_id, tokenId, tokenPath, layer, "$value", "$type", "$description", modes, "$extensions")
    VALUES (@snapshot_id, @tokenId, @tokenPath, @layer, @value, @type, @description, @modes, @extensions)
    ON CONFLICT(tokenId, snapshot_id) DO UPDATE SET
      tokenPath = excluded.tokenPath,
      layer = excluded.layer,
      "$value" = excluded."$value",
      "$type" = excluded."$type",
      "$description" = excluded."$description",
      modes = excluded.modes,
      "$extensions" = excluded."$extensions"
  `);

  const tx = db.transaction((rows) => {
    let n = 0;
    for (const t of rows) {
      stmt.run(toTokenRow(snapshot_id, t));
      n++;
    }
    return n;
  });

  try {
    return tx(tokensArray);
  } catch (err) {
    throw new Error(`couldn't write tokens to snapshot ${snapshot_id}: ${err.message}`);
  }
}

/** (d) All components for a snapshot (or the latest), ordered by name. */
function getAllComponents(snapshotId = null) {
  const db = getDb();
  const sid = snapshotId != null ? snapshotId : latestSnapshotId(db);
  if (sid == null) return [];
  try {
    return db
      .prepare("SELECT * FROM components WHERE snapshot_id = ? ORDER BY name COLLATE NOCASE")
      .all(sid)
      .map(rowToComponent);
  } catch (err) {
    throw new Error(`couldn't read components for snapshot ${sid}: ${err.message}`);
  }
}

/** (e) All tokens for a snapshot (or the latest), ordered by tokenPath. */
function getAllTokens(snapshotId = null) {
  const db = getDb();
  const sid = snapshotId != null ? snapshotId : latestSnapshotId(db);
  if (sid == null) return [];
  try {
    return db
      .prepare("SELECT * FROM tokens WHERE snapshot_id = ? ORDER BY tokenPath COLLATE NOCASE")
      .all(sid)
      .map(rowToToken);
  } catch (err) {
    throw new Error(`couldn't read tokens for snapshot ${sid}: ${err.message}`);
  }
}

/** (f) Tokens for a snapshot (or latest) filtered by layer, ordered by path. */
function getTokensByLayer(layer, snapshotId = null) {
  const db = getDb();
  const sid = snapshotId != null ? snapshotId : latestSnapshotId(db);
  if (sid == null) return [];
  try {
    return db
      .prepare("SELECT * FROM tokens WHERE layer = ? AND snapshot_id = ? ORDER BY tokenPath COLLATE NOCASE")
      .all(layer, sid)
      .map(rowToToken);
  } catch (err) {
    throw new Error(`couldn't read tokens for layer "${layer}" (snapshot ${sid}): ${err.message}`);
  }
}

/** (g) All snapshots, newest first. */
function listSnapshots() {
  const db = getDb();
  try {
    return db
      .prepare("SELECT snapshot_id, timestamp, source, description FROM snapshots ORDER BY created_at DESC")
      .all();
  } catch (err) {
    throw new Error(`couldn't list snapshots: ${err.message}`);
  }
}

/** (h) Full point-in-time state for a snapshot. */
function getSnapshot(snapshot_id) {
  const db = getDb();
  assertSnapshotExists(db, snapshot_id);
  return {
    components: getAllComponents(snapshot_id),
    tokens: getAllTokens(snapshot_id),
  };
}

export {
  getDb,
  closeDb,
  createSnapshot,
  writeComponents,
  writeTokens,
  getAllComponents,
  getAllTokens,
  getTokensByLayer,
  listSnapshots,
  getSnapshot,
  DEFAULT_DB_PATH,
};
