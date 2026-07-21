// Standalone store tests: node src/store/local-db.test.js
// Uses an isolated temp DB (IQM_DB_PATH) so it never touches the real db.sqlite.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the store at a throwaway db BEFORE importing it (dynamic import so the
// env var is set first). getDb() reads IQM_DB_PATH lazily on first use.
const tmpDir = mkdtempSync(join(tmpdir(), "iqm-store-test-"));
process.env.IQM_DB_PATH = join(tmpDir, "test.sqlite");

const store = await import("./local-db.js");

let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failures.push(name);
    console.error(`  ✗ ${name}`);
  }
}

try {
  // --- sample data ---
  const sampleComponents = [
    { componentId: "1:2", name: "Button", page: "❖ Button", description: "Primary control.", status: "Shipped", variantProperties: { Size: ["S", "M", "L"] }, lastModified: "2026-07-14T09:00:00Z" },
    { componentId: "1:1", name: "Alert", page: "🚧 Triage", description: null, status: "WIP", variantProperties: {}, lastModified: "2026-07-15T09:00:00Z" },
  ];
  const sampleTokens = [
    { tokenId: "V:10", tokenPath: "primitives/color/blue/600", layer: "Primitives", $value: "#2563EB", $type: "color", $description: "Theme blue", modes: ["Value"], $extensions: { "com.iqm.figma": { variableId: "V:10", collectionName: "Primitives", modes: ["Value"] } } },
    { tokenId: "V:20", tokenPath: "globalAlias/color/border/focus", layer: "Global Alias", $value: "{primitives.color.blue.600}", $type: "color", $description: null, modes: ["Light", "Dark"], $extensions: { "com.iqm.figma": { variableId: "V:20", collectionName: "Global Alias", modes: ["Light", "Dark"] } } },
  ];

  // --- createSnapshot ---
  const sid1 = store.createSnapshot("manual", "first test snapshot");
  check("createSnapshot returns a numeric id", typeof sid1 === "number" && sid1 > 0);

  // --- writeComponents / writeTokens ---
  const cCount = store.writeComponents(sid1, sampleComponents);
  check("writeComponents returns count 2", cCount === 2);
  const tCount = store.writeTokens(sid1, sampleTokens);
  check("writeTokens returns count 2", tCount === 2);

  // --- getAllComponents: count + ordering by name (Alert before Button) ---
  const comps = store.getAllComponents(sid1);
  check("getAllComponents returns 2", comps.length === 2);
  check("components ordered by name (Alert first)", comps[0].name === "Alert" && comps[1].name === "Button");
  check("variantProperties round-trips as object", comps[1].variantProperties && Array.isArray(comps[1].variantProperties.Size) && comps[1].variantProperties.Size.length === 3);
  check("null description preserved", comps[0].description === null);

  // --- getAllTokens: ordering by tokenPath ---
  const toks = store.getAllTokens(sid1);
  check("getAllTokens returns 2", toks.length === 2);
  check("tokens ordered by tokenPath (globalAlias… before primitives…)", toks[0].tokenPath.startsWith("globalAlias") && toks[1].tokenPath.startsWith("primitives"));
  check("token $value round-trips", toks[1].$value === "#2563EB");
  check("token modes round-trips as array", Array.isArray(toks[1].modes) && toks[1].modes[0] === "Value");
  check("token $extensions round-trips as object", toks[0].$extensions && toks[0].$extensions["com.iqm.figma"].variableId === "V:20");

  // --- getTokensByLayer ---
  const prims = store.getTokensByLayer("Primitives", sid1);
  check("getTokensByLayer('Primitives') returns 1", prims.length === 1 && prims[0].tokenId === "V:10");

  // --- upsert: re-write a component with the same id updates, not duplicates ---
  const upCount = store.writeComponents(sid1, [{ componentId: "1:2", name: "Button", page: "❖ Button", description: "Updated desc.", status: "Shipped", variantProperties: { Size: ["S", "M"] }, lastModified: "2026-07-16T09:00:00Z" }]);
  check("upsert returns count 1", upCount === 1);
  const compsAfter = store.getAllComponents(sid1);
  check("upsert did NOT create a duplicate (still 2)", compsAfter.length === 2);
  const btn = compsAfter.find((c) => c.componentId === "1:2");
  check("upsert updated the description", btn.description === "Updated desc.");

  // --- listSnapshots ---
  const snaps = store.listSnapshots();
  check("listSnapshots includes our snapshot", snaps.some((s) => s.snapshot_id === sid1 && s.source === "manual"));

  // --- getSnapshot: full point-in-time state ---
  const full = store.getSnapshot(sid1);
  check("getSnapshot returns components + tokens", full.components.length === 2 && full.tokens.length === 2);

  // --- latest-snapshot behavior (snapshotId = null) ---
  const sid2 = store.createSnapshot("token_plugin", "second snapshot");
  store.writeComponents(sid2, [{ componentId: "9:9", name: "Modal", page: "❖ Modal", status: "Shipped", variantProperties: {}, lastModified: "2026-07-17T09:00:00Z" }]);
  const latest = store.getAllComponents(null);
  check("getAllComponents(null) reads the latest snapshot", latest.length === 1 && latest[0].name === "Modal");
  check("older snapshot still intact", store.getAllComponents(sid1).length === 2);

  // --- error context ---
  let threw = false;
  try {
    store.writeComponents(999999, sampleComponents);
  } catch (e) {
    threw = /snapshot 999999 does not exist/.test(e.message);
  }
  check("writing to a missing snapshot throws with context", threw);
} finally {
  store.closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures.length === 0) {
  console.log(`\n✓ ${passed} tests passed`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
