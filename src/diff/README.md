# Diff engine (Phase 5)

Compares two store snapshots and produces a machine- + human-readable changeset:
what tokens and components were **added, modified, or removed** between them,
with **field-level** granularity (which fields changed, old → new).

This is the version/changelog layer — the same idea as zeroheight's or
Supernova's "what changed between versions" views.

## Pieces

- **`engine.js`** — pure, storage-agnostic diff logic.
  `diffSnapshots(A, B)`, plus `diffComponents` / `diffTokens` /
  `generateSummary`. No I/O.
- **`local-db-adapter.js`** — reads snapshots from the Phase 3 SQLite store and
  runs the engine. `getDiff(idA, idB)`, `listDiffs(limit)`.
- **`cli.js`** — terminal inspection (`compare`, `show --json`, `recent`).

## Output

See [`docs/DIFF_OUTPUT_SCHEMA.md`](../../docs/DIFF_OUTPUT_SCHEMA.md) for the full
shape. In short:

```jsonc
{
  "from": { "snapshot_id", "timestamp", "source" },
  "to":   { "snapshot_id", "timestamp", "source" },
  "components": { "added": [...], "modified": [...], "removed": [...], "total": {...} },
  "tokens":     { "added": [...], "modified": [...], "removed": [...], "total": {...} },
  "summary": "…"
}
```

`modified` entries carry only the fields that differ, each as
`"field": [old, new]`.

## CLI

```bash
node src/diff/cli.js compare 1 2         # formatted diff, snapshot 1 → 2
node src/diff/cli.js show 1 2 --json     # raw JSON (pipe to jq, etc.)
node src/diff/cli.js recent 5            # last 5 consecutive-snapshot diffs
```

## How Phase 6 / Phase 8 consume it

Both call the adapter — they never touch SQL or the engine internals:

```js
import { getDiff, listDiffs } from "../diff/local-db-adapter.js";
```

- **Phase 6 (docs changelog):** builds a changelog page by calling
  `getDiff(latest - 1, latest)` (or `listDiffs(N)` for a running history) and
  rendering the `added`/`modified`/`removed` sections.
- **Phase 8 (MCP layer):** answers "what changed between these versions?" by
  returning `getDiff(a, b)` — the machine-readable shape is already
  MCP-friendly, and `summary` gives a one-line natural-language answer.

Because the engine is pure, the same `diffSnapshots()` works against any
snapshot source (SQLite now, Firebase/Supabase later) — only the adapter
changes.
