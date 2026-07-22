// MCP tool logic tests against the real store: node src/mcp/mcp.test.js
import * as queryToken from "./tools/query-token.js";
import * as listComponents from "./tools/list-components.js";
import * as getComponent from "./tools/get-component.js";
import * as findChanges from "./tools/find-changes.js";
import * as searchDs from "./tools/search-design-system.js";
import { latestComponents, latestTokens } from "./lib.js";

let passed = 0;
const failures = [];
const check = (name, cond) => { if (cond) passed++; else { failures.push(name); console.error("  ✗ " + name); } };

check("store has components", latestComponents().length > 0);
check("store has tokens", latestTokens().length > 1000);

// --- query-token: exact + alias chain across all four layers ---
const prim = queryToken.run({ search: "primitives/theme-600" });
check("query-token exact primitive", prim.exact && prim.exact.resolvedChain.length === 1);
check("query-token primitive value", prim.exact && prim.exact.resolvedChain[0].value === "#215EE5");

const comp = queryToken.run({ search: "component/button/filled/bg" });
check("query-token exact component token", !!comp.exact);
const chain = comp.exact ? comp.exact.resolvedChain : [];
check("query-token full chain component→system→global→primitive", chain.length === 4);
check("query-token chain resolves to concrete hex", chain.length && chain[chain.length - 1].value === "#215EE5");
check("query-token chain passes through systemAlias", chain.some((h) => h.layer === "System Alias"));

// --- query-token: search + layer filter ---
const focus = queryToken.run({ search: "focus" });
check("query-token search finds focus tokens", focus.matches.some((m) => m.path.includes("focus")));
const primsOnly = queryToken.run({ search: "theme", layer: "Primitives" });
check("query-token layer filter", primsOnly.matches.every((m) => m.layer === "Primitives"));

// --- list-components ---
const lc = listComponents.run({ limit: 10 });
check("list-components respects limit", lc.components.length === 10);
check("list-components reports total", lc.total > 0);
check("list-components sorted by status rank", lc.components.length > 0);

// --- get-component (fuzzy + miss) ---
const anyName = latestComponents()[0].name;
const gc = getComponent.run({ name: anyName });
check("get-component finds by exact name", gc.found && gc.name === anyName);
const miss = getComponent.run({ name: "zzz-nonexistent-zzz" });
check("get-component miss returns found:false", miss.found === false);

// --- find-changes (empty but well-formed with current single-per-source snapshots) ---
const fc = findChanges.run({ days: 3650 });
check("find-changes returns a changes array", Array.isArray(fc.changes));

// --- search-design-system: tokens rank before components on ties ---
const sd = searchDs.run({ query: "button" });
check("search returns results", sd.count > 0);
const firstComponentIdx = sd.results.findIndex((r) => r.type === "component");
const firstTokenIdx = sd.results.findIndex((r) => r.type === "token");
check("search includes both types", firstComponentIdx !== -1 && firstTokenIdx !== -1);

if (failures.length === 0) {
  console.log(`\n✓ ${passed} tests passed`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
