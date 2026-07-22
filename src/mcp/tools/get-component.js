// get-component — full details for a single component (exact or fuzzy name).
import { latestComponents } from "../lib.js";
import { computeChangelog } from "../../export/exporters/changelog.js";

export const description =
  "Get full details for one component by name (exact match preferred, otherwise fuzzy). " +
  "Returns status, page, description, last modified, variant properties, recent changes " +
  "involving it, and a docs link. If no match, returns suggestions.";

export function run({ name } = {}) {
  const comps = latestComponents();
  const q = String(name || "").trim().toLowerCase();
  if (!q) return { found: false, error: "name is required" };

  let match = comps.find((c) => (c.name || "").toLowerCase() === q);
  if (!match) match = comps.find((c) => (c.name || "").toLowerCase().includes(q));

  if (!match) {
    const suggestions = comps
      .filter((c) => (c.name || "").toLowerCase().includes(q.slice(0, 3)))
      .slice(0, 8)
      .map((c) => c.name);
    return { found: false, query: name, suggestions };
  }

  // Diffs involving this component (same-source pairing; empty until 2+ component snapshots).
  const recentChanges = [];
  for (const d of computeChangelog(1000)) {
    const c = d.components;
    const added = c.added.some((x) => x.componentId === match.componentId);
    const mod = c.modified.find((x) => x.componentId === match.componentId);
    const removed = c.removed.some((x) => x.componentId === match.componentId);
    if (added || mod || removed) {
      recentChanges.push({
        from: d.from.snapshot_id,
        to: d.to.snapshot_id,
        at: d.to.timestamp,
        added,
        removed,
        changedFields: mod ? Object.keys(mod.changes) : [],
      });
    }
  }

  return {
    found: true,
    name: match.name,
    status: match.status || "Unknown",
    page: match.page || null,
    description: match.description || null,
    lastModified: match.lastModified || null,
    variantProperties: match.variantProperties || {},
    variantCount: Object.keys(match.variantProperties || {}).length,
    tokensUsed: null, // component→token bindings are not captured in the store
    recentChanges,
    docsPath: `/components/${encodeURIComponent(match.componentId)}`,
    note: "tokensUsed is null — component→token bindings are not captured in the store.",
  };
}
