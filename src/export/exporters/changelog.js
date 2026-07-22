// Machine-readable changelog: the last N diffs, newest first.
//
// Diffs are computed between consecutive snapshots OF THE SAME SOURCE. Components
// and tokens live in separate snapshots, so diffing a component_extract against a
// token_plugin snapshot would falsely read as "all components removed, all tokens
// added". Pairing by source keeps entries meaningful; the list is empty until a
// second snapshot of a given source exists.
import { listSnapshots, getSnapshot } from "../../store/local-db.js";
import { diffSnapshots } from "../../diff/engine.js";

export function computeChangelog(limit = 10) {
  const ordered = listSnapshots()
    .slice()
    .sort((a, b) => a.snapshot_id - b.snapshot_id);

  const bySource = new Map();
  for (const s of ordered) {
    if (!bySource.has(s.source)) bySource.set(s.source, []);
    bySource.get(s.source).push(s);
  }

  const diffs = [];
  for (const arr of bySource.values()) {
    for (let i = 1; i < arr.length; i++) {
      const A = { ...arr[i - 1], ...getSnapshot(arr[i - 1].snapshot_id) };
      const B = { ...arr[i], ...getSnapshot(arr[i].snapshot_id) };
      diffs.push(diffSnapshots(A, B));
    }
  }
  diffs.sort((a, b) => b.to.snapshot_id - a.to.snapshot_id);
  return diffs.slice(0, limit);
}

export function exportChangelog(limit = 10) {
  return JSON.stringify(computeChangelog(limit), null, 2) + "\n";
}
