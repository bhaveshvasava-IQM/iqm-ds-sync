# Plugin setup — IQM Design System Token Exporter (Phase 2)

This Figma plugin reads the file's **local variables** and exports them as
normalized W3C DTCG JSON. It runs entirely inside Figma — no REST API, no
network, no Firebase.

## 1. Build the plugin

The plugin ships as TypeScript (`src/plugin/code.ts`); Figma runs the compiled
`code.js`. Build it once (and again after any edit to `code.ts`):

```bash
# From the repo root
npm install            # picks up esbuild (added as a devDependency)
# or, if you prefer to add it explicitly:
# npm install -D esbuild

npm run build:plugin   # esbuild src/plugin/code.ts -> src/plugin/code.js
```

You should now have `src/plugin/code.js` next to `manifest.json` and `ui.html`.

## 2. Import into Figma

1. Open the **IQM v3** design file in the Figma desktop app.
2. Menu → **Plugins** → **Development** → **Import plugin from manifest…**
3. Select `iqm-ds-sync/src/plugin/manifest.json`.
4. Run it: **Plugins** → **Development** → **IQM Design System Token Exporter**.

## 3. Export

1. In the plugin panel, click **Export Tokens**.
2. The normalized DTCG JSON appears in the text area.
3. Click **Copy to clipboard** (plugins can't write files) and paste into a
   local `.json` file — e.g. `src/plugin/output/tokens.json`.
4. Any warnings (ghost aliases, unknown collections) are summarized under the
   buttons and logged in full to the plugin console
   (**Plugins → Development → Open console**).

## Known caveats (Phase 2 is not committed yet — we validate against the real file first)

- **`permissions: ["variables:read"]`** — this is included per the phase spec.
  Figma's manifest `permissions` enum does **not** currently define a
  `variables:read` value; reading local variables works without any special
  permission. If Figma refuses to import the manifest citing an unknown
  permission, delete the `permissions` line and re-import — variable reads will
  still work. (We'll settle the final manifest once import is confirmed.)
- **Manifest field names** — Figma requires `api` (the API version) and
  `editorType`; both are set. The `id` is a placeholder UUID; Figma assigns a
  real id on publish, which is irrelevant for local development.
- **Sync `getLocalVariables()`** — used as specified. Figma now recommends the
  async variants (`getLocalVariablesAsync`, etc.) with
  `documentAccess: "dynamic-page"`; the sync calls still work for a read-only
  local export. We can migrate if we hit access errors.
- **Multi-mode collapse** — DTCG has no native "mode" concept. `$value`
  reflects the collection's **default mode**; every mode name is listed under
  `$extensions.com.iqm.figma.modes`. Per-mode values (e.g. distinct Light/Dark)
  are not yet emitted — tied to the open question in `schema/schema.md` about
  token shape. Flag if you need full per-mode values in the export.
- **`FLOAT` → `dimension`** — a heuristic. DTCG `dimension` normally carries a
  unit; Figma gives a raw number, so we emit the number as-is. Revisit if the
  file has unitless floats (opacity, line-height) that shouldn't be dimensions.

## What to check against the real file before we commit

1. **Collection names** — the layer mapping keys off names starting with
   `Primitive`, `Global Alias`, `System Alias`, `Component`. Confirm the IQM v3
   collections actually match (memory notes ~930 variables). Anything else lands
   under a camelCased fallback key with a warning — adjust
   `layerKeyFromCollection()` if the real names differ.
2. **Variable count** — the panel reports how many variables were read; sanity-
   check it against the ~930 expected.
3. **A sample token or two** — e.g. a border/focus color and a spacing value —
   confirm `$value`, `$type`, and the alias reference string look right.
