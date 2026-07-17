# iqm-ds-sync

A sync layer for IQM's Figma design system. It pulls design tokens and
component metadata out of Figma, stores them in a queryable place, tracks how
they change over time, and pushes clean docs + a dev handoff out the other end.

Think of it as the connective tissue between the design file (source of truth
for tokens/components) and everything downstream that needs to know when those
tokens and components change.

> **Status: Phase 0 — scaffolding only.**
> This repo currently contains structure and a *draft* schema for human
> review. There are **no live Figma calls, no Firebase writes, and no real
> dependencies installed yet.** Dependencies get added per phase, as each
> phase is built.

---

## Phase roadmap

Each phase is additive. We land one at a time and log it in
[`docs/phase-log.md`](docs/phase-log.md).

| Phase | Name | What it does | Lives in |
|-------|------|--------------|----------|
| **0** | Scaffolding | Repo structure + draft schema + roadmap. No code that touches the network. | *(this commit)* |
| **1** | Extract | Pull components + their native Figma `.description` fields, and token definitions, out of the Figma file. | `src/extract/` |
| **2** | Plugin | Figma plugin that reads variables/collections + component data the REST API can't reach (e.g. modes, C1-bypass checks). | `src/plugin/` |
| **3** | Store | Write extracted records into Firestore. First phase that needs Firebase creds. | `src/store/` |
| **4** | *(reserved)* | Normalization / validation pass over stored records before diffing. | *(tbd)* |
| **5** | Diff | Compare the current extract against the last stored snapshot and produce a changeset (added / changed / removed tokens & components). | `src/diff/` |
| **6/7** | Distribute | Turn the stored records + diffs into human docs and a developer handoff export. | `src/distribute/` |

Phase numbers match the token layer + ship-pipeline vocabulary the design
system already uses (Primitive / Global Alias / System Alias / Component
tokens; WIP / Shipped / Deprecated component stages).

---

## Data model

See [`schema/schema.md`](schema/schema.md) for the **draft** record shapes:

- **Token records** — [DTCG](https://www.designtokens.org/tr/drafts/format/)
  format (`$value` / `$type` / `$description`) plus an
  `$extensions.com.iqm.figma` block carrying Figma-specific metadata
  (nodeId, layer, collection, mode, C1-bypass check).
- **Component records** — our own shape (DTCG doesn't model components):
  Figma node id, name, page, native description, variant properties, last
  modified, and a ship-pipeline `status`.

The schema is **not finalized** — it's a starting point for review.

---

## How to run each phase

Nothing is installed yet, so there's nothing to install for Phase 0.

```bash
# Phase 0 — scaffolding only. This just prints a reminder; there's no work to run.
npm run phase0
```

As later phases land, each will:

1. Add its own dependencies to `package.json` (`npm install` will then matter).
2. Add a `scripts` entry here (e.g. `npm run extract`, `npm run diff`).
3. Document required env vars.

Configuration is via a `.env` file — copy [`.env.example`](.env.example) to
`.env` and fill in real values when a phase needs them. **`.env` and service
account keys are gitignored and must never be committed.**

Required env (per `.env.example`):

- `FIGMA_PAT` — Figma personal access token *(Phase 1+)*
- `FIGMA_FILE_KEY` — the design file key *(Phase 1+)*
- `FIREBASE_PROJECT_ID` — Firestore project *(Phase 3+)*
- `FIREBASE_SERVICE_ACCOUNT` — path to the service account JSON *(Phase 3+)*

---

## Repo layout

```
iqm-ds-sync/
├── .env.example         # placeholder env vars
├── .gitignore
├── package.json         # type: module; deps added per phase
├── README.md            # you are here
├── schema/
│   └── schema.md        # DRAFT record shapes for review
├── src/
│   ├── extract/         # Phase 1 — component/description + token extraction
│   ├── plugin/          # Phase 2 — Figma plugin source
│   ├── store/           # Phase 3 — Firestore write layer
│   ├── diff/            # Phase 5 — diff engine
│   └── distribute/      # Phase 6/7 — docs + dev handoff export
└── docs/
    └── phase-log.md     # append-only, one entry per completed phase
```
