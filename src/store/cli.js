// Terminal inspector for the local store.
//
//   node src/store/cli.js snapshots
//   node src/store/cli.js components [snapshot_id]
//   node src/store/cli.js tokens [snapshot_id]
//   node src/store/cli.js show [snapshot_id]
//
// With no snapshot_id, component/token commands use the latest snapshot;
// `show` with no id dumps every snapshot's full state.

import {
  listSnapshots,
  getAllComponents,
  getAllTokens,
  getSnapshot,
  DEFAULT_DB_PATH,
} from "./local-db.js";

function usage() {
  console.log(`iqm-ds-sync store CLI  (db: ${process.env.IQM_DB_PATH || DEFAULT_DB_PATH})

Usage:
  node src/store/cli.js snapshots
  node src/store/cli.js components [snapshot_id]
  node src/store/cli.js tokens [snapshot_id]
  node src/store/cli.js show [snapshot_id]   # omit id to dump every snapshot`);
}

const [, , cmd, arg] = process.argv;
const snapId = arg != null ? Number(arg) : null;

try {
  switch (cmd) {
    case "snapshots": {
      const rows = listSnapshots();
      if (!rows.length) {
        console.log("(no snapshots yet)");
        break;
      }
      console.table(rows);
      break;
    }
    case "components": {
      const rows = getAllComponents(snapId);
      console.log(`${rows.length} component(s)${snapId ? ` in snapshot ${snapId}` : " (latest snapshot)"}:`);
      if (rows.length) {
        console.table(rows.map((c) => ({ componentId: c.componentId, name: c.name, page: c.page, status: c.status, variants: Object.keys(c.variantProperties || {}).join(",") })));
      }
      break;
    }
    case "tokens": {
      const rows = getAllTokens(snapId);
      console.log(`${rows.length} token(s)${snapId ? ` in snapshot ${snapId}` : " (latest snapshot)"}:`);
      if (rows.length) {
        console.table(rows.map((t) => ({ tokenId: t.tokenId, tokenPath: t.tokenPath, layer: t.layer, $type: t.$type, $value: t.$value })));
      }
      break;
    }
    case "show": {
      if (snapId == null) {
        // No id → dump every snapshot's full state (components + tokens).
        const dump = listSnapshots().map((s) => ({
          snapshot: s,
          ...getSnapshot(s.snapshot_id),
        }));
        console.log(JSON.stringify(dump, null, 2));
      } else {
        console.log(JSON.stringify(getSnapshot(snapId), null, 2));
      }
      break;
    }
    default:
      usage();
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
