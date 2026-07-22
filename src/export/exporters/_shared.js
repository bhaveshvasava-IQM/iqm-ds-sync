// Shared helpers for the Phase 7 exporters. Pure functions over the store's
// flat token rows (tokenPath / layer / $value / $type / $description / modes /
// $extensions), where tokenPath is slash-delimited, e.g. "globalAlias/primary-600".

export const LAYER_KEY_ORDER = { primitives: 0, globalAlias: 1, systemAlias: 2, component: 3 };
export const TOP_LEVEL_KEYS = ["primitives", "globalAlias", "systemAlias", "component"];

export function isAlias(v) {
  return typeof v === "string" && /^\{.+\}$/.test(v.trim());
}

// "{primitives.theme-600}" -> "primitives.theme-600"
export function aliasInner(v) {
  return v.trim().slice(1, -1);
}

// tokenPath "globalAlias/primary-600" -> dotted "globalAlias.primary-600"
export function dottedPath(tokenPath) {
  return String(tokenPath).replace(/\//g, ".");
}

// Flat, dash-separated CSS/SCSS identifier from a "/"- or "."-delimited path.
// "globalAlias/primary-600" -> "global-alias-primary-600" (matches alias inner too).
// Non-identifier characters (spaces etc.) collapse to a single dash so the
// result is always a valid CSS custom-property / SCSS variable name — e.g.
// "font-weight/semi bold" -> "font-weight-semi-bold".
export function varName(path) {
  return String(path)
    .split(/[/.]/)
    .map((seg) =>
      seg
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .join("-");
}

// The store stringifies every $value. Restore numbers/booleans by $type;
// leave alias refs and other strings as-is.
export function coerceValue(value, type) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  if (isAlias(value)) return value;
  if (type === "boolean") return value === "true";
  if ((type === "dimension" || type === "number") && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

export function sortTokens(tokens) {
  return tokens.slice().sort((a, b) => {
    const la = LAYER_KEY_ORDER[a.tokenPath.split("/")[0]] ?? 99;
    const lb = LAYER_KEY_ORDER[b.tokenPath.split("/")[0]] ?? 99;
    if (la !== lb) return la - lb;
    return a.tokenPath.localeCompare(b.tokenPath);
  });
}

// Rebuild the nested DTCG tree from flat rows. Leaves carry $value/$type/
// $description/$extensions. When coerce=true, numeric/boolean $values are
// restored to real numbers/booleans.
export function nestTokens(tokens, { coerce = false } = {}) {
  const root = {};
  for (const t of sortTokens(tokens)) {
    const parts = t.tokenPath.split("/").filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== "object" || cur[p] === null || "$value" in cur[p]) {
        if (cur[p] === undefined) cur[p] = {};
      }
      cur = cur[p];
    }
    const leaf = parts[parts.length - 1];
    cur[leaf] = {
      $value: coerce ? coerceValue(t.$value, t.$type) : t.$value,
      $type: t.$type,
      $description: t.$description ?? null,
      $extensions: t.$extensions ?? null,
    };
  }
  return root;
}

export function byDottedMap(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(dottedPath(t.tokenPath), t);
  return m;
}

// Follow an alias chain to a concrete value. Returns the concrete value, or the
// last alias string if the chain can't be resolved (missing target / cycle).
export function resolveConcrete(token, byDotted) {
  let cur = token;
  let v = coerceValue(cur.$value, cur.$type);
  const seen = new Set();
  let guard = 0;
  while (typeof v === "string" && isAlias(v)) {
    const inner = aliasInner(v);
    if (seen.has(inner) || guard++ > 20) return v;
    seen.add(inner);
    const next = byDotted.get(inner);
    if (!next) return v;
    cur = next;
    v = coerceValue(cur.$value, cur.$type);
  }
  return v;
}

// CSS value: alias -> var(--ref); color/other -> literal.
export function cssValue(token) {
  if (isAlias(token.$value)) return `var(--${varName(aliasInner(token.$value))})`;
  const v = coerceValue(token.$value, token.$type);
  return v == null ? "" : String(v);
}
