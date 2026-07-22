// find-changes — recent diffs across snapshots (same-source pairing).
import { computeChangelog } from "../../export/exporters/changelog.js";

export const description =
  "List recent design system changes (diffs between consecutive snapshots of the same " +
  "source). Optionally filter by days (default 7), source (component_extract | token_plugin), " +
  "and limit (default 10). Diffs compare like-with-like; the list is empty until a second " +
  "snapshot of a given source exists.";

export function run({ days = 7, source, limit = 10 } = {}, now = new Date()) {
  let diffs = computeChangelog(1000);

  if (source) diffs = diffs.filter((d) => d.to.source === source);

  if (days != null && Number.isFinite(days)) {
    const cutoff = now.getTime() - days * 86400000;
    diffs = diffs.filter((d) => {
      const t = Date.parse(d.to.timestamp);
      return Number.isNaN(t) ? true : t >= cutoff;
    });
  }

  const limited = diffs.slice(0, Math.max(0, limit)).map((d) => ({
    from: d.from.snapshot_id,
    to: d.to.snapshot_id,
    at: d.to.timestamp,
    source: d.to.source,
    summary: d.summary,
    components: d.components.total,
    tokens: d.tokens.total,
  }));

  return {
    filters: { days, source: source || "all", limit },
    count: limited.length,
    changes: limited,
    note:
      diffs.length === 0
        ? "No comparable diffs yet — need at least two snapshots of the same source."
        : undefined,
  };
}
