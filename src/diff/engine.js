// Diff engine (Phase 5) — pure, storage-agnostic snapshot comparison.
//
// diffSnapshots(A, B) compares two snapshot objects (each { snapshot_id?,
// timestamp?, source?, components[], tokens[] }) and returns the changeset
// documented in docs/DIFF_OUTPUT_SCHEMA.md. No I/O — the store adapter feeds
// it snapshots and it returns data.

// --- value comparison ----------------------------------------------------

// Key-order-independent stringify, so { a:1, b:2 } === { b:2, a:1 } and nested
// objects/arrays (variantProperties, modes, $extensions) compare by value.
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

function valuesEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

// Compare two records over the given fields; return only the fields that differ
// as { field: [oldValue, newValue] } (undefined normalized to null).
function fieldChanges(a, b, fields) {
  const changes = {};
  for (const f of fields) {
    const av = a[f] === undefined ? null : a[f];
    const bv = b[f] === undefined ? null : b[f];
    if (!valuesEqual(av, bv)) changes[f] = [av, bv];
  }
  return changes;
}

function indexBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr || []) {
    const key = keyFn(item);
    if (key != null) map.set(key, item);
  }
  return map;
}

const COMPONENT_FIELDS = ["name", "description", "status", "variantProperties", "lastModified"];
const TOKEN_FIELDS = ["$value", "$type", "$description", "modes", "$extensions"];

// --- components ----------------------------------------------------------

/**
 * @param {object[]} compA components in the "from" snapshot
 * @param {object[]} compB components in the "to" snapshot
 * @param {string|null} toTimestamp the "to" snapshot timestamp (for removedAt)
 */
function diffComponents(compA, compB, toTimestamp = null) {
  const aById = indexBy(compA, (c) => c.componentId);
  const bById = indexBy(compB, (c) => c.componentId);

  const added = [];
  const modified = [];
  const removed = [];
  let unchanged = 0;

  for (const [id, b] of bById) {
    if (!aById.has(id)) {
      added.push({
        componentId: b.componentId,
        name: b.name ?? null,
        status: b.status ?? null,
        description: b.description ?? null,
      });
    }
  }

  for (const [id, a] of aById) {
    const b = bById.get(id);
    if (!b) {
      removed.push({ componentId: a.componentId, name: a.name ?? null, removedAt: toTimestamp });
      continue;
    }
    const changes = fieldChanges(a, b, COMPONENT_FIELDS);
    if (Object.keys(changes).length > 0) {
      modified.push({ componentId: b.componentId, name: b.name ?? null, changes });
    } else {
      unchanged++;
    }
  }

  return {
    added,
    modified,
    removed,
    total: { added: added.length, modified: modified.length, removed: removed.length, unchanged },
  };
}

// --- tokens --------------------------------------------------------------

// Tokens are keyed by tokenPath, falling back to tokenId when path is absent.
function tokenKey(t) {
  return t.tokenPath != null && t.tokenPath !== "" ? t.tokenPath : t.tokenId;
}

/**
 * @param {object[]} tokA tokens in the "from" snapshot
 * @param {object[]} tokB tokens in the "to" snapshot
 * @param {string|null} toTimestamp the "to" snapshot timestamp (for removedAt)
 */
function diffTokens(tokA, tokB, toTimestamp = null) {
  const aByPath = indexBy(tokA, tokenKey);
  const bByPath = indexBy(tokB, tokenKey);

  const added = [];
  const modified = [];
  const removed = [];
  let unchanged = 0;

  for (const [path, b] of bByPath) {
    if (!aByPath.has(path)) {
      added.push({
        tokenPath: b.tokenPath ?? path,
        layer: b.layer ?? null,
        $type: b.$type ?? null,
        $value: b.$value ?? null,
      });
    }
  }

  for (const [path, a] of aByPath) {
    const b = bByPath.get(path);
    if (!b) {
      removed.push({ tokenPath: a.tokenPath ?? path, layer: a.layer ?? null, removedAt: toTimestamp });
      continue;
    }
    const changes = fieldChanges(a, b, TOKEN_FIELDS);
    if (Object.keys(changes).length > 0) {
      modified.push({ tokenPath: b.tokenPath ?? path, layer: b.layer ?? null, changes });
    } else {
      unchanged++;
    }
  }

  return {
    added,
    modified,
    removed,
    total: { added: added.length, modified: modified.length, removed: removed.length, unchanged },
  };
}

// --- summary + top-level -------------------------------------------------

/** One-liner for UI + logging. */
function generateSummary(componentDiff, tokenDiff) {
  const c = componentDiff.total;
  const t = tokenDiff.total;
  return (
    `${c.added} components added, ${c.modified} modified, ${c.removed} removed; ` +
    `${t.added} tokens added, ${t.modified} modified, ${t.removed} removed`
  );
}

function meta(snapshot) {
  return {
    snapshot_id: snapshot && snapshot.snapshot_id != null ? snapshot.snapshot_id : null,
    timestamp: snapshot && snapshot.timestamp != null ? snapshot.timestamp : null,
    source: snapshot && snapshot.source != null ? snapshot.source : null,
  };
}

/**
 * Compare snapshot A (older/from) with snapshot B (newer/to).
 * Each snapshot: { snapshot_id?, timestamp?, source?, components[], tokens[] }.
 */
function diffSnapshots(snapshotA, snapshotB) {
  const A = snapshotA || {};
  const B = snapshotB || {};
  const components = diffComponents(A.components || [], B.components || [], B.timestamp ?? null);
  const tokens = diffTokens(A.tokens || [], B.tokens || [], B.timestamp ?? null);
  return {
    from: meta(A),
    to: meta(B),
    components,
    tokens,
    summary: generateSummary(components, tokens),
  };
}

export { diffSnapshots, diffComponents, diffTokens, generateSummary, valuesEqual };
