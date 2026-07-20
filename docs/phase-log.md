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
