// Glue between the Phase 3 SQLite store and the pure diff engine.
// Reads snapshots from the store, runs the engine, returns the changeset.

import { getSnapshot, listSnapshots } from "../store/local-db.js";
import { diffSnapshots } from "./engine.js";

// Load a snapshot's metadata + full contents into the shape the engine wants.
function loadSnapshot(snapshotId) {
  const meta = listSnapshots().find((s) => s.snapshot_id === snapshotId);
  if (!meta) {
    const available = listSnapshots().map((s) => s.snapshot_id);
    throw new Error(`snapshot ${snapshotId} not found. Available: ${available.length ? available.join(", ") : "(none)"}`);
  }
  const { components, tokens } = getSnapshot(snapshotId); // throws with context if missing
  return { ...meta, components, tokens };
}

/** Compare two snapshots by id → full diff object (see DIFF_OUTPUT_SCHEMA.md). */
function getDiff(snapshotIdA, snapshotIdB) {
  const A = loadSnapshot(snapshotIdA);
  const B = loadSnapshot(snapshotIdB);
  return diffSnapshots(A, B);
}

/**
 * Compute diffs between each consecutive pair of snapshots (oldest→newest),
 * returned newest-first and capped at `limit`. Useful for "show me the last N
 * changes". Returns [] when there are fewer than two snapshots.
 */
function listDiffs(limit = 10) {
  // listSnapshots() is newest-first; sort ascending by id for chronological pairing.
  const ordered = listSnapshots()
    .slice()
    .sort((a, b) => a.snapshot_id - b.snapshot_id);
  if (ordered.length < 2) return [];

  const diffs = [];
  for (let i = 1; i < ordered.length; i++) {
    diffs.push(getDiff(ordered[i - 1].snapshot_id, ordered[i].snapshot_id));
  }
  diffs.reverse(); // newest diff first
  return diffs.slice(0, limit);
}

export { getDiff, listDiffs };
