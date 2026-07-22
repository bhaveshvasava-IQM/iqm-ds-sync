// list-components — browse the component catalog.
import { latestComponents, firstSentence, statusRank } from "../lib.js";

export const description =
  "List design system components. Optionally filter by status " +
  "(Shipped, WIP, Deprecated, Foundation, Unknown, or 'all') and/or page name. " +
  "Sorted by status (Shipped first) then alphabetically. Default limit 20.";

export function run({ status, page, limit = 20 } = {}) {
  let comps = latestComponents();

  if (status && status !== "all") {
    const want = status.toLowerCase();
    comps = comps.filter((c) => (c.status || "Unknown").toLowerCase() === want);
  }
  if (page) {
    const p = page.toLowerCase();
    comps = comps.filter((c) => (c.page || "").toLowerCase().includes(p));
  }

  comps.sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.name || "").localeCompare(b.name || ""));

  const total = comps.length;
  const shown = comps.slice(0, Math.max(0, limit)).map((c) => ({
    name: c.name,
    status: c.status || "Unknown",
    page: c.page || null,
    description: firstSentence(c.description) || null,
    variantCount: Object.keys(c.variantProperties || {}).length,
  }));

  return { total, shown: shown.length, filters: { status: status || "all", page: page || null }, components: shown };
}
