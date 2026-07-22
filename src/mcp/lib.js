// Shared helpers for the MCP tools/resources. Pure (no SDK) so they're
// unit-testable and reused by both the server and the CLI.

import { getAllComponents, getAllTokens, listSnapshots } from "../store/local-db.js";
import { isAlias, aliasInner, dottedPath, coerceValue, byDottedMap } from "../export/exporters/_shared.js";

// Components and tokens live in separate snapshots, so "latest" is per-type:
// the newest snapshot that actually contains rows of that kind.
export function latestComponents() {
  for (const s of listSnapshots()) {
    const c = getAllComponents(s.snapshot_id);
    if (c.length) return c;
  }
  return [];
}
export function latestTokens() {
  for (const s of listSnapshots()) {
    const t = getAllTokens(s.snapshot_id);
    if (t.length) return t;
  }
  return [];
}

export function firstSentence(text) {
  if (!text) return "";
  const t = String(text).trim();
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

// Ship-pipeline order for sorting (nulls -> "Unknown", last).
const STATUS_ORDER = { Shipped: 0, WIP: 1, Foundation: 2, Deprecated: 3, Unknown: 4 };
export function statusRank(status) {
  return STATUS_ORDER[status || "Unknown"] ?? 5;
}

// Follow an alias chain, returning each hop as { path, layer, value }. The last
// hop's value is concrete (or the chain stops at a missing/cyclic reference).
export function resolveChain(token, byDotted) {
  const chain = [];
  const seen = new Set();
  let cur = token;
  let guard = 0;
  while (cur) {
    const v = coerceValue(cur.$value, cur.$type);
    chain.push({ path: cur.tokenPath, layer: cur.layer, value: v });
    if (typeof v === "string" && isAlias(v)) {
      const inner = aliasInner(v);
      if (seen.has(inner) || guard++ > 20) break;
      seen.add(inner);
      cur = byDotted.get(inner);
    } else break;
  }
  return chain;
}

// Rank tokens + components (and optionally changelog) against a free-text query.
// Tokens rank before components on score ties (per the Phase 8 spec).
export function searchAll(query, type = "all") {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const out = [];

  if (type === "all" || type === "token") {
    for (const t of latestTokens()) {
      const name = (t.tokenPath || "").toLowerCase();
      const desc = (t.$description || "").toLowerCase();
      const val = String(t.$value ?? "").toLowerCase();
      let score = 0;
      let matchedIn = "";
      if (name === q || name.endsWith("/" + q)) { score = 100; matchedIn = "path"; }
      else if (name.includes(q)) { score = 70; matchedIn = "path"; }
      else if (desc.includes(q)) { score = 45; matchedIn = "description"; }
      else if (val.includes(q)) { score = 35; matchedIn = "value"; }
      if (score) out.push({ type: "token", title: t.tokenPath, subtitle: t.layer, value: t.$value, score, matchedIn });
    }
  }

  if (type === "all" || type === "component") {
    for (const c of latestComponents()) {
      const name = (c.name || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      let score = 0;
      let matchedIn = "";
      if (name === q) { score = 99; matchedIn = "name"; }
      else if (name.includes(q)) { score = 68; matchedIn = "name"; }
      else if (desc.includes(q)) { score = 44; matchedIn = "description"; }
      if (score) out.push({ type: "component", title: c.name, subtitle: c.page, componentId: c.componentId, status: c.status || "Unknown", score, matchedIn });
    }
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      (a.type === b.type ? 0 : a.type === "token" ? -1 : 1) ||
      String(a.title).localeCompare(String(b.title))
  );
  return out;
}

export { byDottedMap, dottedPath };
