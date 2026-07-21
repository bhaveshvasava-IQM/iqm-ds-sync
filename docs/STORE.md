# Store layer (Phase 3)

The local **source-of-truth** store. Phase 1 (components) and Phase 2 (tokens)
write snapshots here; Phase 5 (diff) and Phase 6+ (docs/handoff) read from it.
No Figma, no Firebase, no network — just a SQLite file and synchronous Node
functions.

Backed by [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3). The
`local-db.js` interface is deliberately storage-agnostic (see
[Swapping backends](#swapping-backends-later)).

## Database file

- Default path: `src/store/db.sqlite` (created on first use).
- Override with the `IQM_DB_PATH` env var (the test suite uses this to run
  against a throwaway temp DB).
- The `.db`/`.sqlite` files are **gitignored** — only `schema.sql` is committed.

## Schema overview

Three tables (full DDL in [`schema.sql`](../src/store/schema.sql)):

```
snapshots (1) ──< (many) components
     │
     └────────< (many) tokens
```

- **snapshots** — one capture of the design system at a point in time.
  `snapshot_id`, `timestamp` (ISO), `source`
  (`component_extract` | `token_plugin` | `manual`), `description`,
  `created_at` (unix ms, for sorting).
- **components** — mirrors Phase 1 output: `componentId` (Figma node id),
  `name`, `page`, `description`, `status`
  (`Shipped`/`WIP`/`Deprecated`/`Foundation`/null), `variantProperties` (JSON),
  `lastModified`. Unique per `(componentId, snapshot_id)`.
- **tokens** — mirrors Phase 2 DTCG output: `tokenId` (Figma variable id),
  `tokenPath` (e.g. `primitives/color/blue/600`), `layer`, `$value`, `$type`,
  `$description`, `modes` (JSON array), `$extensions` (JSON). Unique per
  `(tokenId, snapshot_id)`.

Foreign keys are enabled (`ON DELETE CASCADE` from snapshots). Unique indexes on
`(componentId, snapshot_id)` and `(tokenId, snapshot_id)` enforce per-snapshot
uniqueness **and** power the upsert (`ON CONFLICT`) behavior.

## Using `local-db.js`

All functions are synchronous — they return data or throw an `Error` with
context (never a raw SQLite error).

```js
import {
  createSnapshot, writeComponents, writeTokens,
  getAllComponents, getAllTokens, getTokensByLayer,
  listSnapshots, getSnapshot,
} from "./src/store/local-db.js";

// 1. Open a snapshot to write into.
const sid = createSnapshot("component_extract", "nightly pull");

// 2. Write (upsert — re-writing the same id updates in place).
writeComponents(sid, componentsArray); // -> count
writeTokens(sid, tokensArray);         // -> count

// 3. Read back.
getAllComponents();          // latest snapshot, ordered by name
getAllComponents(sid);       // a specific snapshot
getAllTokens(sid);           // ordered by tokenPath
getTokensByLayer("Primitives", sid);
listSnapshots();             // newest first
getSnapshot(sid);            // { components, tokens }
```

### Input shapes

- `writeComponents` accepts Phase 1 component records directly
  (`componentId`, `name`, `page`, `description`, `status`, `variantProperties`,
  `lastModified`).
- `writeTokens` accepts flat token rows **or** Phase 2 DTCG leaf tokens. When
  `tokenId` / `layer` / `modes` aren't present at the top level it falls back to
  `$extensions.com.iqm.figma` (`variableId`, `collectionName`, `modes`).
  `tokenPath` should be supplied by the caller (Phase 4 derives it from the
  nested DTCG structure).

## Inspecting via CLI

```bash
node src/store/cli.js snapshots              # list all snapshots
node src/store/cli.js components [snapshot]  # components (latest if omitted)
node src/store/cli.js tokens [snapshot]      # tokens (latest if omitted)
node src/store/cli.js show <snapshot>        # full JSON state dump
```

## Tests

```bash
npm run test:store   # node src/store/local-db.test.js
```

Runs against an isolated temp DB (via `IQM_DB_PATH`), so it never touches your
real `db.sqlite`. Covers create/write/read, ordering, JSON round-tripping,
upsert-not-duplicate, latest-snapshot resolution, and error context.

## Swapping backends later

`local-db.js` is the contract; SQLite is one implementation. A Firebase or
Supabase backend would export the **same function names and signatures**
(`createSnapshot`, `writeComponents`, … `getSnapshot`) so callers in Phases
1/2/5/6 don't change. Only the internals differ:

| Concept        | SQLite (now)                  | Firebase (later)                 |
|----------------|-------------------------------|----------------------------------|
| snapshot       | row in `snapshots`            | doc in `snapshots/{id}`          |
| components     | rows in `components`          | `snapshots/{id}/components/{cid}`|
| tokens         | rows in `tokens`              | `snapshots/{id}/tokens/{tid}`    |
| upsert         | `INSERT … ON CONFLICT`        | `set(..., { merge: true })`      |
| latest         | `ORDER BY created_at DESC`    | query + `orderBy('created_at')`  |

Keep new backends behind the same interface and the rest of the pipeline is
none the wiser.
