// changelog — recent diffs rendered as readable reference text.
import { computeChangelog } from "../../export/exporters/changelog.js";

export const meta = {
  uri: "iqm://changelog",
  name: "changelog",
  description: "Recent design system changes (diffs between same-source snapshots), newest first.",
  mimeType: "text/markdown",
};

export function render() {
  const diffs = computeChangelog(20);
  const out = ["# IQM Design System — changelog\n"];
  if (!diffs.length) {
    out.push("_No changes recorded yet._ A changelog entry needs at least two snapshots of the");
    out.push("same source (component_extract or token_plugin). Take another extract/import to populate.");
    out.push("");
    return out.join("\n");
  }
  for (const d of diffs) {
    out.push(`## snapshot ${d.from.snapshot_id} → ${d.to.snapshot_id} · ${d.to.source} · ${d.to.timestamp}`);
    out.push(`\n${d.summary}\n`);
    const section = (label, s) => {
      if (!s.added.length && !s.modified.length && !s.removed.length) return;
      out.push(`**${label}:** +${s.total.added} / ~${s.total.modified} / -${s.total.removed}`);
      for (const x of s.added.slice(0, 20)) out.push(`  - + ${x.tokenPath || x.name || x.componentId}`);
      for (const x of s.modified.slice(0, 20)) out.push(`  - ~ ${x.tokenPath || x.name || x.componentId}: ${Object.keys(x.changes).join(", ")}`);
      for (const x of s.removed.slice(0, 20)) out.push(`  - - ${x.tokenPath || x.name || x.componentId}`);
    };
    section("Components", d.components);
    section("Tokens", d.tokens);
    out.push("");
  }
  return out.join("\n");
}
