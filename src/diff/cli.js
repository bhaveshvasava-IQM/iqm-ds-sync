// Terminal tool for inspecting diffs.
//
//   node src/diff/cli.js compare <A_id> <B_id>          formatted diff
//   node src/diff/cli.js show <A_id> <B_id> --json       raw JSON (pipe-friendly)
//   node src/diff/cli.js recent [N]                      last N consecutive diffs (default 5)

import { getDiff, listDiffs } from "./local-db-adapter.js";

const [, , cmd, ...rest] = process.argv;
const wantJson = rest.includes("--json");
const ids = rest.filter((a) => a !== "--json");

function printSection(label, section) {
  const t = section.total;
  console.log(`  ${label}: +${t.added} added  ~${t.modified} modified  -${t.removed} removed  (${t.unchanged} unchanged)`);
  for (const a of section.added.slice(0, 5)) console.log(`      + ${a.tokenPath || a.componentId}${a.name ? ` (${a.name})` : ""}`);
  for (const m of section.modified.slice(0, 5)) console.log(`      ~ ${m.tokenPath || m.componentId}${m.name ? ` (${m.name})` : ""}: ${Object.keys(m.changes).join(", ")}`);
  for (const r of section.removed.slice(0, 5)) console.log(`      - ${r.tokenPath || r.componentId}${r.name ? ` (${r.name})` : ""}`);
  const extra = section.added.length + section.modified.length + section.removed.length - Math.min(5, section.added.length) - Math.min(5, section.modified.length) - Math.min(5, section.removed.length);
  if (extra > 0) console.log(`      … and ${extra} more (use --json for the full list)`);
}

function printDiff(diff) {
  console.log(`\nsnapshot ${diff.from.snapshot_id} (${diff.from.source}) → ${diff.to.snapshot_id} (${diff.to.source})`);
  console.log(`  ${diff.summary}`);
  printSection("components", diff.components);
  printSection("tokens", diff.tokens);
}

try {
  switch (cmd) {
    case "compare":
    case "show": {
      if (ids.length < 2) {
        console.error(`Usage: node src/diff/cli.js ${cmd} <A_id> <B_id>${cmd === "show" ? " --json" : ""}`);
        process.exit(1);
      }
      const [a, b] = ids.map(Number);
      const diff = getDiff(a, b);
      if (wantJson) console.log(JSON.stringify(diff, null, 2));
      else printDiff(diff);
      break;
    }
    case "recent": {
      const n = ids.length ? Number(ids[0]) : 5;
      const diffs = listDiffs(n);
      if (!diffs.length) {
        console.log("(need at least two snapshots to diff)");
        break;
      }
      for (const d of diffs) {
        console.log(`snapshot ${d.from.snapshot_id} → ${d.to.snapshot_id}: ${d.summary}`);
      }
      break;
    }
    default:
      console.log(`iqm-ds-sync diff CLI

Usage:
  node src/diff/cli.js compare <A_id> <B_id>
  node src/diff/cli.js show <A_id> <B_id> --json
  node src/diff/cli.js recent [N]`);
  }
} catch (err) {
  // Missing snapshots etc. — report cleanly (the flow ran; there's just nothing
  // to compare). Exit 0 so "compare 1 2" before both snapshots exist isn't a
  // hard failure, per the Phase 5 acceptance criteria.
  console.log(`Nothing to compare: ${err.message}`);
  process.exit(0);
}
