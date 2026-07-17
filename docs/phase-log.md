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
