// Diff engine unit tests: node src/diff/diff.test.js
// Pure engine tests against hand-built mock snapshots (no store, no I/O).

import { diffSnapshots, diffComponents, diffTokens, generateSummary } from "./engine.js";

let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) passed++;
  else {
    failures.push(name);
    console.error(`  ✗ ${name}`);
  }
}

// --- fixtures ---
const comp = (over = {}) => ({ componentId: "1:1", name: "Button", page: "❖ Button", description: "Primary control.", status: "Shipped", variantProperties: { Size: ["S", "M"] }, lastModified: "2026-07-14T09:00:00Z", ...over });
const tok = (over = {}) => ({ tokenId: "V:1", tokenPath: "primitives/color/blue/600", layer: "Primitives", $value: "#2563EB", $type: "color", $description: "blue", modes: ["Value"], $extensions: { "com.iqm.figma": { variableId: "V:1" } }, ...over });
const snap = (id, ts, components, tokens) => ({ snapshot_id: id, timestamp: ts, source: "test", components, tokens });

// =====================================================================
// COMPONENTS
// =====================================================================

// 1. added
{
  const d = diffComponents([], [comp()]);
  check("component added → added[0]", d.added.length === 1 && d.added[0].componentId === "1:1");
  check("component added carries name/status/description", d.added[0].name === "Button" && d.added[0].status === "Shipped" && d.added[0].description === "Primary control.");
  check("component added counts", d.total.added === 1 && d.total.modified === 0 && d.total.removed === 0 && d.total.unchanged === 0);
}

// 2. removed (with removedAt from toTimestamp)
{
  const d = diffComponents([comp()], [], "2026-07-21T00:00:00Z");
  check("component removed → removed[0]", d.removed.length === 1 && d.removed[0].componentId === "1:1");
  check("component removedAt = toTimestamp", d.removed[0].removedAt === "2026-07-21T00:00:00Z");
}

// 3/4/5. modified: name / description / status
{
  const dName = diffComponents([comp()], [comp({ name: "Button v2" })]);
  check("modified name only", dName.modified.length === 1 && JSON.stringify(dName.modified[0].changes) === JSON.stringify({ name: ["Button", "Button v2"] }));

  const dDesc = diffComponents([comp()], [comp({ description: "Updated." })]);
  check("modified description only", Object.keys(dDesc.modified[0].changes).join() === "description");

  const dStatus = diffComponents([comp({ status: "WIP" })], [comp({ status: "Shipped" })]);
  check("modified status only", JSON.stringify(dStatus.modified[0].changes.status) === JSON.stringify(["WIP", "Shipped"]));
}

// 6. modified: variantProperties (deep object change)
{
  const d = diffComponents([comp()], [comp({ variantProperties: { Size: ["S", "M", "L"] } })]);
  check("modified variantProperties (deep)", !!d.modified[0].changes.variantProperties && d.modified[0].changes.variantProperties[1].Size.length === 3);
}

// 7. modified includes ONLY changed fields
{
  const d = diffComponents([comp()], [comp({ description: "New." })]); // only description differs
  check("changes contains ONLY differing fields", Object.keys(d.modified[0].changes).length === 1 && "description" in d.modified[0].changes);
}

// 8. unchanged (identical, incl. reordered object keys)
{
  const a = comp({ variantProperties: { Size: ["S", "M"], State: ["Default"] } });
  const b = comp({ variantProperties: { State: ["Default"], Size: ["S", "M"] } }); // same, keys reordered
  const d = diffComponents([a], [b]);
  check("identical component (key-order-independent) → unchanged", d.total.unchanged === 1 && d.modified.length === 0);
}

// =====================================================================
// TOKENS
// =====================================================================

// 9. added
{
  const d = diffTokens([], [tok()]);
  check("token added carries path/layer/type/value", d.added.length === 1 && d.added[0].tokenPath === "primitives/color/blue/600" && d.added[0].layer === "Primitives" && d.added[0].$type === "color" && d.added[0].$value === "#2563EB");
}

// 10. removed
{
  const d = diffTokens([tok()], [], "2026-07-21T00:00:00Z");
  check("token removed with removedAt + layer", d.removed.length === 1 && d.removed[0].layer === "Primitives" && d.removed[0].removedAt === "2026-07-21T00:00:00Z");
}

// 11/12/13. modified: $value / $type / $description
{
  const dVal = diffTokens([tok()], [tok({ $value: "#1D4ED8" })]);
  check("token modified $value", JSON.stringify(dVal.modified[0].changes.$value) === JSON.stringify(["#2563EB", "#1D4ED8"]));
  const dType = diffTokens([tok()], [tok({ $type: "dimension" })]);
  check("token modified $type", "$type" in dType.modified[0].changes);
  const dDesc = diffTokens([tok()], [tok({ $description: "focus blue" })]);
  check("token modified $description", "$description" in dDesc.modified[0].changes);
}

// 14. modified: modes (array change)
{
  const d = diffTokens([tok()], [tok({ modes: ["Light", "Dark"] })]);
  check("token modified modes (array)", !!d.modified[0].changes.modes && d.modified[0].changes.modes[1].length === 2);
}

// 15. modified: $extensions (deep object change)
{
  const d = diffTokens([tok()], [tok({ $extensions: { "com.iqm.figma": { variableId: "V:1", c1BypassChecked: false } } })]);
  check("token modified $extensions (deep)", "$extensions" in d.modified[0].changes);
}

// 16. token keyed by tokenPath (path stable, id changes → NOT added/removed, just modified id-in-extension unaffected)
{
  const d = diffTokens([tok({ $value: "#000" })], [tok({ $value: "#fff" })]);
  check("token matched by tokenPath across snapshots", d.added.length === 0 && d.removed.length === 0 && d.modified.length === 1);
}

// =====================================================================
// TOP-LEVEL diffSnapshots
// =====================================================================

// 17. no changes → all zero
{
  const A = snap(1, "t1", [comp()], [tok()]);
  const B = snap(2, "t2", [comp()], [tok()]);
  const d = diffSnapshots(A, B);
  check("identical snapshots → all counts zero", d.components.total.modified === 0 && d.tokens.total.modified === 0 && d.components.total.unchanged === 1 && d.tokens.total.unchanged === 1);
}

// 18. from/to metadata
{
  const d = diffSnapshots(snap(1, "t1", [], []), snap(2, "t2", [], []));
  check("from/to metadata populated", d.from.snapshot_id === 1 && d.to.snapshot_id === 2 && d.from.timestamp === "t1" && d.to.timestamp === "t2");
}

// 19. mixed scenario across both types
{
  const A = snap(1, "t1",
    [comp({ componentId: "keep" }), comp({ componentId: "gone", name: "Gone" }), comp({ componentId: "chg", status: "WIP" })],
    [tok({ tokenPath: "p/keep" }), tok({ tokenPath: "p/gone" }), tok({ tokenPath: "p/chg", $value: "#000" })]);
  const B = snap(2, "t2",
    [comp({ componentId: "keep" }), comp({ componentId: "chg", status: "Shipped" }), comp({ componentId: "new", name: "New" })],
    [tok({ tokenPath: "p/keep" }), tok({ tokenPath: "p/chg", $value: "#fff" }), tok({ tokenPath: "p/new" })]);
  const d = diffSnapshots(A, B);
  const c = d.components.total;
  const t = d.tokens.total;
  check("mixed components: 1 added, 1 modified, 1 removed, 1 unchanged", c.added === 1 && c.modified === 1 && c.removed === 1 && c.unchanged === 1);
  check("mixed tokens: 1 added, 1 modified, 1 removed, 1 unchanged", t.added === 1 && t.modified === 1 && t.removed === 1 && t.unchanged === 1);
  check("removed component removedAt from B timestamp", d.components.removed[0].removedAt === "t2");
}

// 20. summary phrasing
{
  const A = snap(1, "t1", [comp({ componentId: "gone" })], []);
  const B = snap(2, "t2", [comp({ componentId: "new1" }), comp({ componentId: "new2" })], [tok()]);
  const d = diffSnapshots(A, B);
  const expected = "2 components added, 0 modified, 1 removed; 1 tokens added, 0 modified, 0 removed";
  check("summary phrasing", d.summary === expected);
  check("generateSummary matches diffSnapshots.summary", generateSummary(d.components, d.tokens) === expected);
}

// --- report ---
if (failures.length === 0) {
  console.log(`\n✓ ${passed} tests passed`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
