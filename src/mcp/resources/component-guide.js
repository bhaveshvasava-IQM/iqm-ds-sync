// component-guide — the component catalog rendered as readable reference text.
import { latestComponents, firstSentence, statusRank } from "../lib.js";

export const meta = {
  uri: "iqm://components/guide",
  name: "component-guide",
  description: "Component catalog grouped by page: name, status, variants, and description.",
  mimeType: "text/markdown",
};

export function render() {
  const comps = latestComponents();
  if (!comps.length) return "# IQM Components\n\n_No components in the store yet._\n";

  const byPage = new Map();
  for (const c of comps) {
    const key = c.page || "(no page)";
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(c);
  }

  const out = [];
  out.push("# IQM Components — catalog");
  const statusCounts = {};
  for (const c of comps) statusCounts[c.status || "Unknown"] = (statusCounts[c.status || "Unknown"] || 0) + 1;
  out.push(`\n${comps.length} components across ${byPage.size} pages.`);
  out.push("Status: " + Object.entries(statusCounts).map(([s, n]) => `${s} (${n})`).join(", ") + ".\n");

  for (const page of [...byPage.keys()].sort()) {
    const rows = byPage.get(page).slice().sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || (a.name || "").localeCompare(b.name || "")
    );
    out.push(`\n## ${page} — ${rows.length}\n`);
    for (const c of rows) {
      const variants = Object.keys(c.variantProperties || {});
      const vtxt = variants.length ? ` · variants: ${variants.join(", ")}` : "";
      const desc = firstSentence(c.description);
      out.push(`- **${c.name}** [${c.status || "Unknown"}]${vtxt}${desc ? ` — ${desc}` : ""}`);
    }
  }
  out.push("");
  return out.join("\n");
}
