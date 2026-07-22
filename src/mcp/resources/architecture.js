// architecture — a guide to the IQM design system structure + how to use this server.
import { latestComponents, latestTokens } from "../lib.js";

export const meta = {
  uri: "iqm://architecture",
  name: "architecture",
  description: "How the IQM design system is structured (four-layer tokens, ship pipeline) and how to query this server.",
  mimeType: "text/markdown",
};

export function render() {
  const tokens = latestTokens();
  const comps = latestComponents();
  const layerCounts = {};
  for (const t of tokens) layerCounts[t.layer || "Other"] = (layerCounts[t.layer || "Other"] || 0) + 1;

  return `# IQM Design System — architecture

This MCP server exposes the IQM v3 design system (mirrored into a local store by the
\`iqm-ds-sync\` pipeline) so AI agents can answer design questions **without opening Figma**.

Current snapshot: **${comps.length} components**, **${tokens.length} tokens**.

## Four-layer token architecture

Tokens flow through four layers; each references the one above it, never skipping:

1. **Primitives** (${layerCounts["Primitives"] || 0}) — raw values (hex, numbers). Modes: Blue / Green / Purple / Responsive.
2. **Global Alias** (${layerCounts["Global Alias"] || 0}) — semantic scales (primary-*, neutral-*, success-*). Modes: Light / Dark.
3. **System Alias** (${layerCounts["System Alias"] || 0}) — shared UI decisions (color/bg/primary, color/border/focus). Modes: Light / Dark.
4. **Component** (${layerCounts["Component"] || 0}) — component-specific tokens (button/filled/bg). Mode: Default.

**The C1-bypass rule:** a Component token must alias to System Alias or Global Alias —
never straight to a Primitive. Component tokens carry a \`c1BypassChecked\` flag.

Alias values look like \`{globalAlias.primary-600}\`. Use \`query-token\` on an exact path to
see the full resolved chain down to the concrete value.

## Component ship pipeline

Components carry a status: **Shipped → WIP → Deprecated** (plus Foundation, or Unknown when
Figma doesn't expose one). Browse with \`list-components\`, drill in with \`get-component\`.

## Tools

- **query-token** — search/fetch tokens; resolves alias chains on exact matches.
- **list-components** — browse the catalog (filter by status/page).
- **get-component** — full detail for one component.
- **find-changes** — recent diffs (between same-source snapshots).
- **search-design-system** — full-text search across tokens + components.

## Resources

- \`iqm://tokens/reference\` — full token catalog.
- \`iqm://components/guide\` — component catalog.
- \`iqm://changelog\` — recent changes.
- \`iqm://architecture\` — this document.

## Known limits

- Token↔component usage bindings are **not** captured (\`whereUsed\` / \`tokensUsed\` are null).
- Each token carries its **default-mode** value only (mode names are listed, but distinct
  Light/Dark values aren't stored).
- Components and tokens live in **separate snapshots**; "latest" is resolved per data type.
`;
}
