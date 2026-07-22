// tokens-reference — the full token set rendered as readable reference text.
import { latestTokens } from "../lib.js";

const LAYER_ORDER = ["Primitives", "Global Alias", "System Alias", "Component"];

export const meta = {
  uri: "iqm://tokens/reference",
  name: "tokens-reference",
  description: "Complete token catalog (all layers) as readable reference text: path, type, value, modes, description.",
  mimeType: "text/markdown",
};

export function render() {
  const tokens = latestTokens();
  if (!tokens.length) return "# IQM Design Tokens\n\n_No tokens in the store yet._\n";

  const byLayer = new Map();
  for (const t of tokens) {
    const key = t.layer || "Other";
    if (!byLayer.has(key)) byLayer.set(key, []);
    byLayer.get(key).push(t);
  }
  const layers = [...byLayer.keys()].sort(
    (a, b) => (LAYER_ORDER.indexOf(a) + 1 || 99) - (LAYER_ORDER.indexOf(b) + 1 || 99)
  );

  const out = [];
  out.push("# IQM Design Tokens — reference");
  out.push(`\n${tokens.length} tokens across ${layers.length} layers. Aliases are shown as \`{dotted.path}\` references.\n`);
  out.push("Layer counts: " + layers.map((l) => `${l} (${byLayer.get(l).length})`).join(", ") + ".\n");

  for (const layer of layers) {
    const rows = byLayer.get(layer).slice().sort((a, b) => a.tokenPath.localeCompare(b.tokenPath));
    out.push(`\n## ${layer} — ${rows.length} tokens\n`);
    const modeSet = new Set();
    rows.forEach((r) => (r.modes || []).forEach((m) => modeSet.add(m)));
    if (modeSet.size) out.push(`Modes: ${[...modeSet].join(", ")}.\n`);
    for (const t of rows) {
      const desc = t.$description ? ` — ${t.$description}` : "";
      out.push(`- \`${t.tokenPath}\` (${t.$type}): \`${t.$value}\`${desc}`);
    }
  }
  out.push("");
  return out.join("\n");
}
