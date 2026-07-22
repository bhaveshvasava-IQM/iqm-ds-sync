// query-token — search + fetch tokens, with alias-chain resolution on exact hits.
import { latestTokens, resolveChain, byDottedMap, dottedPath } from "../lib.js";

export const description =
  "Search design tokens by name/path/description, or fetch an exact token by path " +
  "(e.g. 'primitives/color/blue/600' or 'globalAlias/primary-600'). Optionally filter " +
  "by layer (Primitives, Global Alias, System Alias, Component) or mode (Light, Dark, " +
  "Blue, Green, Purple, Responsive, Default). Returns up to 10 matches; for an exact " +
  "match, also resolves the full alias chain down to the concrete value.";

export function run({ search, layer, mode } = {}) {
  const all = latestTokens();
  const byDotted = byDottedMap(all);
  const q = String(search || "").trim();
  const qLower = q.toLowerCase();

  let pool = all;
  if (layer) pool = pool.filter((t) => (t.layer || "").toLowerCase() === layer.toLowerCase());
  if (mode) pool = pool.filter((t) => Array.isArray(t.modes) && t.modes.some((m) => m.toLowerCase() === mode.toLowerCase()));

  // Exact match by tokenPath (slash) or dotted path.
  const exact =
    pool.find((t) => t.tokenPath === q) ||
    pool.find((t) => dottedPath(t.tokenPath) === q) ||
    pool.find((t) => t.tokenPath.toLowerCase() === qLower) ||
    null;

  // Rank the pool for the match list.
  const scored = [];
  for (const t of pool) {
    const name = t.tokenPath.toLowerCase();
    const desc = (t.$description || "").toLowerCase();
    const val = String(t.$value ?? "").toLowerCase();
    let score = 0;
    if (name === qLower || name.endsWith("/" + qLower)) score = 100;
    else if (name.includes(qLower)) score = 70;
    else if (desc.includes(qLower)) score = 45;
    else if (val.includes(qLower)) score = 35;
    if (score || !q) scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score || a.t.tokenPath.localeCompare(b.t.tokenPath));

  const matches = scored.slice(0, 10).map(({ t }) => ({
    name: t.tokenPath.split("/").pop(),
    path: t.tokenPath,
    value: t.$value,
    type: t.$type,
    description: t.$description || null,
    layer: t.layer,
    modes: t.modes || [],
    whereUsed: null, // token→component bindings are not tracked in the store
  }));

  const result = {
    query: q,
    filters: { layer: layer || null, mode: mode || null },
    matchCount: matches.length,
    matches,
    note: "whereUsed is null — token→component usage bindings are not captured in the store.",
  };

  if (exact) {
    result.exact = {
      path: exact.tokenPath,
      resolvedChain: resolveChain(exact, byDotted),
    };
  }
  return result;
}
