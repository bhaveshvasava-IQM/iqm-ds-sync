# Diff output schema

This is the **contract between Phase 5 (diff engine) and its consumers**
(Phase 6 docs changelog, Phase 8 MCP "what changed" queries, manual impact
assessment). The diff engine produces exactly this shape.

## Top-level structure

```jsonc
{
  "from": { "snapshot_id": 1, "timestamp": "2026-07-20T…Z", "source": "component_extract" },
  "to":   { "snapshot_id": 2, "timestamp": "2026-07-21T…Z", "source": "component_extract" },

  "components": {
    "added":    [ { "componentId": "12:3", "name": "Badge", "status": "WIP", "description": "…" } ],
    "modified": [ { "componentId": "1:5",  "name": "Button", "changes": { "status": ["WIP", "Shipped"] } } ],
    "removed":  [ { "componentId": "9:9",  "name": "OldModal", "removedAt": "2026-07-21T…Z" } ],
    "total":    { "added": 1, "modified": 1, "removed": 1, "unchanged": 480 }
  },

  "tokens": {
    "added":    [ { "tokenPath": "primitives/color/teal/500", "layer": "Primitives", "$type": "color", "$value": "#14B8A6" } ],
    "modified": [ { "tokenPath": "globalAlias/color/border/focus", "layer": "Global Alias", "changes": { "$value": ["#2563EB", "#1D4ED8"] } } ],
    "removed":  [ { "tokenPath": "primitives/color/legacy/gray", "layer": "Primitives", "removedAt": "2026-07-21T…Z" } ],
    "total":    { "added": 1, "modified": 1, "removed": 1, "unchanged": 1072 }
  },

  "summary": "0 components added, 1 modified, 1 removed; 1 tokens added, 1 modified, 1 removed"
}
```

## Field notes

### `from` / `to`
Snapshot metadata for the two endpoints. `from` is the older (A) snapshot, `to`
is the newer (B). Each: `snapshot_id`, `timestamp` (ISO), `source`.

### `components` and `tokens`
Both follow the same shape: `added`, `modified`, `removed`, `total`.

- **added** — present in `to` but not in `from`.
  - components: `{ componentId, name, status, description }`
  - tokens: `{ tokenPath, layer, $type, $value }`
- **modified** — present in both, but at least one tracked field differs.
  - `{ componentId | tokenPath, name | layer, changes }`
  - **`changes` contains ONLY the fields that differ**, each as
    `"field": [oldValue, newValue]`. If `description` changed but `status`
    didn't, `changes` has only `description`.
  - Tracked component fields: `name`, `description`, `status`,
    `variantProperties`, `lastModified`.
  - Tracked token fields: `$value`, `$type`, `$description`, `modes`,
    `$extensions`.
  - Object/array fields (`variantProperties`, `modes`, `$extensions`) are
    compared by value (deep, key-order-independent). When they differ, the full
    old and new values appear in the pair.
- **removed** — present in `from` but not in `to`.
  - `{ componentId | tokenPath, name | layer, removedAt }`
  - `removedAt` is the **`to` snapshot's timestamp** (when the item was first
    observed absent), or `null` if the `to` snapshot has no timestamp.
- **total** — `{ added, modified, removed, unchanged }` counts. `unchanged`
  counts items present and identical in both.

### Identity keys
- Components are matched by **`componentId`** (Figma node id).
- Tokens are matched by **`tokenPath`** (e.g. `primitives/color/blue/600`),
  falling back to `tokenId` if a token has no path.

### `summary`
A human one-liner:
`"N components added, M modified, K removed; P tokens added, Q modified, R removed"`.

## Consuming this

```js
import { getDiff, listDiffs } from "../diff/local-db-adapter.js";

const diff = getDiff(1, 2);      // compare two snapshots by id
const recent = listDiffs(10);    // last 10 consecutive-snapshot diffs, newest first
```

Consumers should treat the shape above as stable. New optional fields may be
added; existing fields won't change meaning without a version bump noted here.
