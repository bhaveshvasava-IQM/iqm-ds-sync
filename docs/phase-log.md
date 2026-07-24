# Phase log

Append-only. One entry per phase completed, newest at the bottom. Same spirit
as `design-system-work-log-v5.md` — a durable record of what landed, when, and
what's deliberately deferred.

---

## Phase 0 — Scaffolding — 2026-07-17

**Goal:** Stand up the repo structure and a draft schema for review. No live
integrations.

**Landed:**
- Repo skeleton: `.gitignore`, `.env.example`, `package.json` (type: module,
  no real deps), `README.md` with the phase roadmap.
- Source directory stubs: `src/extract`, `src/plugin`, `src/store`,
  `src/diff`, `src/distribute` (all empty, awaiting their phases).
- `schema/schema.md` — **draft** DTCG-based token record + bespoke component
  record, each with 2–3 worked IQM examples.
- This log.

**Deliberately deferred (not in scope for Phase 0):**
- No Firebase SDK, no Figma API client, no other real dependencies installed.
- No code that touches the network.
- Schema is a draft, explicitly **not finalized** — open questions listed at
  the bottom of `schema/schema.md`.

**Next:** Phase 1 — extraction of components (+ native descriptions) and token
definitions from the Figma file, landing in `src/extract/`.

---

## Phase 1 — Component extraction — 2026-07-20

**Goal:** Prove we can pull component + description data out of Figma via the
REST API and normalize it to the schema's COMPONENT shape. Tokens/variables are
explicitly out of scope (Phase 2, via a plugin). No Firebase writes.

Phase 1: component extraction working, **369 components / 117 component sets
found** (486 total nodes) in "Design System - Experiments".

**Landed:**
- `src/extract/figma-client.js` — `fetchFileTree()` wrapping
  `GET /v1/files/:file_key`. Credentials read from `.env` via dotenv; clear,
  actionable errors for missing/invalid PAT, 401/403, 404, and network failure
  (no raw HTTP dumps).
- `src/extract/extract-components.js` — recursive walk collecting COMPONENT /
  COMPONENT_SET nodes into records matching `schema/schema.md`. Variant children
  of a set are skipped (the set represents them). `status` is left `null` —
  the API doesn't expose WIP/Shipped/Deprecated (deferred; likely derived from
  page-name convention, e.g. a `❖` prefix = shipped).
- `src/extract/run.js` — runnable via `npm run extract:components`; writes
  `src/extract/output/components-{timestamp}.json` and prints a summary
  (totals + documentation gaps).
- `dotenv` added to `package.json`; `output/` gitignored.

**Notable finding (fixed):** the file-tree endpoint does **not** put
`.description` on the component nodes in the `document` tree — a naive read gave
0/486 descriptions. Descriptions live in the top-level `components` /
`componentSets` metadata maps, keyed by node id. The extractor now enumerates
from the document tree (the maps also include remote library components not in
this file) and joins the description in from the maps. Result: **90 of 486
components carry a real native description; 396 are documentation gaps.**

**Deliberately deferred:** no Firebase, no DB writes, no tokens/variables. Per-
node `lastModified` isn't in this endpoint's payload, so records carry the
file-level `lastModified` for now.

**Next:** Phase 2 — token/variable extraction via a Figma plugin (`src/plugin/`),
since variables + modes + C1-bypass checks aren't reachable from the REST API.

---

## [2026-07] Phases 1 & 2 complete

Phase 1 (REST extraction): 486 components, 90 with descriptions, 396 gaps
Phase 2 (Figma plugin): 1,075 variables, 4-layer hierarchy verified, 
  zero violations, modes auto-detected correctly. Ready for Phases 3–8.

---

## Phase 3: local SQLite store — 2026-07

- `src/store/schema.sql` + `local-db.js` (better-sqlite3 v11): snapshots /
  components / tokens, FKs on, upsert via unique `(id, snapshot_id)` indexes.
- Storage-agnostic interface (createSnapshot / write* / get* / listSnapshots /
  getSnapshot); CLI inspector; `test:store` → 21/21 pass against a temp DB.
- DB at `src/store/db.sqlite` (gitignored; schema committed).

## [2026-07] Phase 4: wiring → store

- `src/extract/run.js` now writes components to SQLite (keeps the JSON debug copy)
- Created `src/store/import-tokens.js` for manual token import — flattens the
  plugin's nested DTCG export into flat rows, deriving `tokenPath` from the key
  path and `layer` from the top-level key (primitives → "Primitives", etc.)
- Store tests: 21/21 passing
- Wiring is live and testable. Next: Phase 5 (diff engine)

**Verified 2026-07-21:** `extract:components` wrote real components to snapshot 1
against the live Figma file (count now **497** — it keeps drifting from Phase 1's
486 as the file is actively edited; Phase 5's diff will track exactly this). The
token path was verified end-to-end with a **representative sample** export
(5 tokens across all four layers, incl. an alias) plus a mismatch case proving
the top-level-key layer mapping wins over `$extensions.collectionName`:
`import:tokens` flattened, wrote to snapshot 2, and both were queryable via
`cli.js`. The real ~1,075-token import still needs a live plugin export from
Figma (the plugin runs in-app; not reproducible headless).

---

## Phase 5: diff engine

- Implemented component + token diffing with field-level granularity
  (`src/diff/engine.js`, pure & storage-agnostic): only the fields that differ
  appear in `changes` as `[old, new]`; deep, key-order-independent comparison
  for `variantProperties` / `modes` / `$extensions`.
- Produces machine + human-readable changesets; shape documented in
  `docs/DIFF_OUTPUT_SCHEMA.md` (the contract for Phase 6/8).
- `local-db-adapter.js` reads snapshots from the Phase 3 store
  (`getDiff`, `listDiffs`).
- **26** test cases covering added/removed/modified (each field), unchanged,
  mixed scenarios, and summary phrasing — `npm run test:diff` → 26/26.
- CLI for manual inspection: `node src/diff/cli.js compare <A> <B>`
  (also `show <A> <B> --json`, `recent [N]`).
- Ready for Phase 6 (docs integration) + Phase 8 (MCP layer).

**Verified 2026-07-21:** all three acceptance criteria met — tests pass;
`compare 1 2` runs cleanly even when a snapshot is missing (graceful message,
exit 0); and the JSON output was structurally validated against
`DIFF_OUTPUT_SCHEMA.md` using a temp db with two deliberately-differing
snapshots (1 added / 1 modified / 1 removed on each of components and tokens).

---

## [2026-07-22] Real token import + Phase 7: dev exports

**Milestone — pipeline end-to-end with real data.** Imported the real Phase 2
plugin export: **snapshot 2 = 1,135 tokens** (264 Primitives / 128 Global Alias
/ 117 System Alias / 626 Component; 626/626 component tokens
`c1BypassChecked: true`, zero violations) alongside snapshot 1's 487 components.
Docs site rebuilt — token pages (1,135) now populate. Docs `store.js` fixed to
resolve latest-per-type (components and tokens live in separate snapshots) and
to diff only same-source snapshots in the changelog.

**Phase 7 — dev exports (`src/export/`):** six exporters (CSS, SCSS, JSON/DTCG,
JS ESM, TS defs, changelog) + `build.js` orchestrator (`--out` for docs) +
`validate.js` + `index.js`. `npm run export` → `dist/` (gitignored);
`npm run test:export` → 21/21; `npm run validate:export` → 14/14.
- CSS keeps `var(--ref)` alias chains (order-independent); SCSS flattens aliases
  to concrete values (SCSS vars are order-dependent).
- `varName` sanitizes non-identifier chars (fixed a real bug: token
  `font-weight/semi bold` produced an invalid CSS/SCSS identifier with a space).
- Integrated into iqm-ds-docs via a `prebuild` step → exports deploy at
  `/tokens.css`, `/tokens.json`, etc. on every docs build.

**Known limits (unchanged from earlier phases):** dimension tokens export as
unitless numbers (store holds raw Figma values); per-mode Light/Dark values
aren't captured upstream (plugin emits default-mode value + mode names only), so
no dark-mode export block. `tsc` isn't installed locally, so the `.d.ts` was
verified structurally + via the runtime `tokens.js` import, not a full type-check.

---

## [2026-07-22] Phase 8: MCP server

Wraps the store as an MCP server (`src/mcp/`) for AI agents (Claude/Cursor/Zed) —
queryable design system, no Figma. Uses `@modelcontextprotocol/sdk` v1.29 + zod.

- **5 tools:** query-token (resolves alias chains), list-components, get-component,
  find-changes, search-design-system. Pure `run()` logic, SDK-free and unit-tested.
- **4 resources:** `iqm://tokens/reference`, `iqm://components/guide`,
  `iqm://changelog`, `iqm://architecture`.
- `server.js` (stdio + `createServer()` factory), `cli.js` (list/call/resource +
  `selftest` in-memory round-trip), README with editor-config.
- Verified: `test:mcp` 18/18 (tool logic vs real store — incl. the full
  component→system→global→primitive alias chain resolving to `#215EE5`);
  `mcp:selftest` 6/6 (real Client↔Server over InMemoryTransport:
  listTools/callTool/listResources/readResource).

**Known limits:** token↔component usage bindings not captured (whereUsed/tokensUsed
null); default-mode values only; changelog needs ≥2 same-source snapshots.

**Pipeline complete (Phases 0–8):** Figma → extract/plugin → SQLite store → diff →
docs site → dev exports → MCP. Firebase (schema env vars present) still unwired;
no git remote (commits local).

---

## [2026-07-24] Hosting + display polish (deploy config / display layer only)

Four scoped changes — no touching the MCP server, exports, diff engine,
extraction, or the store's underlying data. Committed as four separate commits
(three in iqm-ds-docs, one here).

- **Task 1 — GitHub Pages (iqm-ds-docs):** `site`/`base` (`/iqm-ds-docs`) in
  astro.config; `withBase()`/`stripBase()` helpers applied across all internal
  links; `.github/workflows/deploy.yml` builds + deploys to Pages. The docs
  build reads THIS sibling repo (prebuild exporter + `db.sqlite`), so the
  workflow checks out **both** repos and `npm install`s each. Triggers: push to
  main, workflow_dispatch, and `repository_dispatch: store-updated` (the cascade
  target for Task 4). No git remote yet → not pushed; user must create the repo
  + remote before the first deploy.
- **Task 2 — sidebar filter (iqm-ds-docs):** reused the existing `isInternal()`
  to drop `_`/`.`-prefixed atoms from the sidebar tree (directory toggle stays
  the audit escape hatch).
- **Task 3 — icons as Foundations (iqm-ds-docs):** `FOUNDATION_PAGES = ["Icons"]`
  + `isFoundation()` in store.js (display layer only; `page` field untouched).
  Icons (363) moved out of the component library into a new "Foundations"
  sidebar group + `/foundations` page; excluded from the components grid.
  Honest three-bucket math, no double-counting: **50 components · 74 internal
  atoms · 363 icons (Foundations) = 487**.
- **Task 4 — one-click sync (this repo):** `sync-and-deploy.yml` (workflow_dispatch
  → extract:components → force-add/commit `db.sqlite` → push → cross-repo
  `repository_dispatch` to docs) + optional `import-tokens.yml` (JSON text
  input). Secrets only (FIGMA_PAT, FIGMA_FILE_KEY, DOCS_DISPATCH_TOKEN);
  workflow_dispatch is write-access-only. Plain-language `docs/HOW_TO_SYNC.md`.

**Deploy prerequisites (not yet satisfied — no remote configured):** create the
two GitHub repos + remotes; add the three Actions secrets; the store `db.sqlite`
must be committed in this repo for the docs CI to have data (the sync workflow
force-adds it — or commit it once manually to bootstrap the first deploy). The
full cascade (sync → commit → push → docs rebuild → live site) can only be
verified once remotes + secrets exist.
