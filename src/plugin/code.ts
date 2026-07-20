// IQM Design System Token Exporter — Figma plugin logic (Phase 2).
//
// Runs INSIDE Figma. Reads local variables, normalizes them to W3C DTCG shape
// with IQM extensions, and hands the JSON back to the UI. No REST API, no
// network, no Firebase.
//
// Build: `npm run build:plugin` (esbuild transpiles this to code.js).

// Ambient decls so this transpiles without @figma/plugin-typings installed.
// (esbuild does no type-checking; these just keep editors/tsc quiet.)
declare const figma: any;
declare const __html__: string;
declare const globalThis: any;

// ---------------------------------------------------------------------------
// Pure helpers — no `figma` dependency, so they're unit-testable under Node.
// ---------------------------------------------------------------------------

interface RgbaLike {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** Figma stores color channels as 0..1 floats. Emit #RRGGBB (or #RRGGBBAA). */
function colorToHex(c: RgbaLike): string {
  const ch = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
  const a = c.a === undefined ? 1 : c.a;
  return (a < 1 ? `${base}${ch(a)}` : base).toUpperCase();
}

/**
 * Map a Figma variable collection name onto one of our four layer keys.
 * Unknown collections are kept (never silently dropped) under a camelCased
 * key, and the caller emits a warning.
 */
function layerKeyFromCollection(name: string): string {
  const k = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (k.indexOf("primitive") === 0) return "primitives";
  if (k.indexOf("globalalias") === 0 || k === "global" || k === "globals") return "globalAlias";
  if (k.indexOf("systemalias") === 0 || k === "system" || k === "systems") return "systemAlias";
  if (k.indexOf("component") === 0) return "component";
  const camel = (name || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_m: string, c: string) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (m: string) => m.toLowerCase());
  return camel || "unknown";
}

/** Infer a DTCG $type from Figma's resolvedType. */
function toDtcgType(resolvedType: string): string {
  switch (resolvedType) {
    case "COLOR":
      return "color";
    // Heuristic: FLOAT design tokens here are overwhelmingly spacing / radius /
    // size, i.e. dimensions. DTCG `dimension` ideally carries a unit; Figma
    // gives a raw number, so we emit the number and leave the unit as an open
    // refinement (tracked with schema open-question on token shape).
    case "FLOAT":
      return "dimension";
    case "STRING":
      return "string";
    case "BOOLEAN":
      return "boolean";
    default:
      return "other";
  }
}

// A resolved per-mode value in the intermediate map.
//   kind: "value" -> concrete hex/number/string/boolean (in `value`)
//   kind: "alias" -> DTCG reference string like "{primitives.color.blue.600}"
//   kind: "ghost" -> alias whose target variable is missing/deleted
type DtcgValue =
  | { kind: "value"; value: string | number | boolean | null }
  | { kind: "alias"; value: string; targetLayer: string }
  | { kind: "ghost"; value: null; id: string };

interface VariableEntry {
  variableId: string;
  name: string;
  collectionName: string;
  resolvedType: string;
  description: string | null;
  scopes: string[];
  modeNames: string[];
  defaultModeName: string | null;
  values: Record<string, DtcgValue>;
}

interface ReadResult {
  variables: VariableEntry[];
  warnings: string[];
}

/**
 * Resolve one raw Figma mode value into a DtcgValue. Handles concrete values,
 * variable aliases (built into a DTCG reference), and ghost aliases (target
 * deleted).
 */
function resolveValue(
  raw: any,
  resolvedType: string,
  varsById: Map<string, any>,
  colById: Map<string, any>,
  warnings: string[],
  ownerName: string
): DtcgValue {
  if (raw === undefined || raw === null) return { kind: "value", value: null };

  // Alias to another variable?
  if (typeof raw === "object" && raw.type === "VARIABLE_ALIAS") {
    const ref = varsById.get(raw.id);
    if (!ref) {
      warnings.push(`Ghost alias: "${ownerName}" references missing variable ${raw.id} — skipped.`);
      return { kind: "ghost", value: null, id: raw.id };
    }
    const refCol = colById.get(ref.variableCollectionId);
    const layer = layerKeyFromCollection(refCol ? refCol.name : "");
    const path = String(ref.name)
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(".");
    return { kind: "alias", value: `{${layer}.${path}}`, targetLayer: layer };
  }

  // Concrete color object -> hex.
  if (resolvedType === "COLOR" && typeof raw === "object") {
    return { kind: "value", value: colorToHex(raw as RgbaLike) };
  }

  // Concrete number / string / boolean.
  return { kind: "value", value: raw };
}

// ---------------------------------------------------------------------------
// Figma-dependent extraction
// ---------------------------------------------------------------------------

/**
 * Read every local variable in the file, resolved per mode.
 * Returns entries carrying everything normalizeToDTCG needs, plus warnings
 * (e.g. ghost aliases). If the file has no variables, `variables` is empty and
 * a "No variables found" warning is included.
 */
function readAllVariables(): ReadResult {
  const warnings: string[] = [];

  const collections = figma.variables.getLocalVariableCollections() || [];
  const variables = figma.variables.getLocalVariables() || [];

  if (!variables.length) {
    warnings.push("No variables found");
    return { variables: [], warnings };
  }

  const varsById = new Map<string, any>();
  for (const v of variables) varsById.set(v.id, v);
  const colById = new Map<string, any>();
  for (const c of collections) colById.set(c.id, c);

  const entries: VariableEntry[] = [];

  for (const v of variables) {
    const col = colById.get(v.variableCollectionId);
    const modes: Array<{ modeId: string; name: string }> = col ? col.modes : [];
    const defaultModeId = col ? col.defaultModeId : modes[0] && modes[0].modeId;

    const values: Record<string, DtcgValue> = {};
    let defaultModeName: string | null = null;
    for (const m of modes) {
      if (m.modeId === defaultModeId) defaultModeName = m.name;
      const raw = v.valuesByMode ? v.valuesByMode[m.modeId] : undefined;
      values[m.name] = resolveValue(raw, v.resolvedType, varsById, colById, warnings, v.name);
    }

    entries.push({
      variableId: v.id,
      name: v.name,
      collectionName: col ? col.name : "(unknown collection)",
      resolvedType: v.resolvedType,
      description: v.description ? v.description : null,
      scopes: v.scopes || [],
      modeNames: modes.map((m) => m.name),
      defaultModeName: defaultModeName || (modes[0] ? modes[0].name : null),
      values,
    });
  }

  return { variables: entries, warnings };
}

// ---------------------------------------------------------------------------
// Normalization to DTCG
// ---------------------------------------------------------------------------

// A C1-bypass violation: a Component-layer token that aliases DIRECTLY to a
// Primitive, skipping the Global/System Alias contract layer ("C1"). Component
// tokens must route through an alias layer, never straight to a primitive.
interface C1Violation {
  name: string;
  variableId: string;
  collectionName: string;
  modes: string[]; // modes in which the bypass occurs
  target: string; // the primitive reference it bypasses to (first offending mode)
}

interface NormalizeResult {
  tokens: Record<string, any>;
  warnings: string[];
  violations: C1Violation[];
}

/**
 * Transform the intermediate variable entries into a nested DTCG structure,
 * grouped by the four IQM layers. Each token carries $value (from the
 * collection's default mode), $type, $description, and a com.iqm.figma
 * extension block. Multi-mode note: DTCG has no native mode concept, so $value
 * reflects the DEFAULT mode and all mode names are listed under
 * $extensions.com.iqm.figma.modes (see schema open-question on token shape).
 */
function normalizeToDTCG(read: ReadResult): NormalizeResult {
  const root: Record<string, any> = {
    primitives: {},
    globalAlias: {},
    systemAlias: {},
    component: {},
  };
  const warnings = (read.warnings || []).slice();
  const violations: C1Violation[] = [];

  for (const e of read.variables) {
    const layerKey = layerKeyFromCollection(e.collectionName);
    if (!root[layerKey]) {
      root[layerKey] = {};
      warnings.push(`Unknown collection "${e.collectionName}" → grouped under "${layerKey}".`);
    }

    const dv = e.defaultModeName ? e.values[e.defaultModeName] : undefined;
    let value: string | number | boolean | null = null;
    if (dv) value = dv.kind === "ghost" ? null : dv.value;

    // C1-bypass check: only meaningful for Component-layer tokens. A component
    // token that aliases straight to a primitive (in any mode) bypasses the
    // Global/System Alias contract layer.
    const isComponent = layerKey === "component";
    let bypasses = false;
    const bypassModes: string[] = [];
    let bypassTarget = "";
    if (isComponent) {
      for (const modeName of e.modeNames) {
        const mv = e.values[modeName];
        if (mv && mv.kind === "alias" && mv.targetLayer === "primitives") {
          bypasses = true;
          bypassModes.push(modeName);
          if (!bypassTarget) bypassTarget = mv.value;
        }
      }
    }
    // true = checked & compliant; false = checked & violating; null = N/A (non-component layer)
    const c1BypassChecked = isComponent ? !bypasses : null;
    if (bypasses) {
      violations.push({
        name: e.name,
        variableId: e.variableId,
        collectionName: e.collectionName,
        modes: bypassModes,
        target: bypassTarget,
      });
    }

    const token = {
      $value: value,
      $type: toDtcgType(e.resolvedType),
      $description: e.description || null,
      $extensions: {
        "com.iqm.figma": {
          variableId: e.variableId,
          collectionName: e.collectionName,
          scopes: e.scopes,
          modes: e.modeNames,
          c1BypassChecked,
        },
      },
    };

    // Nest by the variable's "/"-delimited name path.
    const parts = e.name
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    let cursor = root[layerKey];
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cursor[p] !== "object" || cursor[p] === null || "$value" in cursor[p]) {
        if (cursor[p] === undefined) cursor[p] = {};
        // If a token already sits here, don't clobber it — warn and skip nesting.
        else if (cursor[p] && "$value" in cursor[p]) {
          warnings.push(`Name collision at "${parts.slice(0, i + 1).join("/")}" for "${e.name}".`);
        }
      }
      cursor = cursor[p];
    }
    const leaf = parts.length ? parts[parts.length - 1] : e.name;
    cursor[leaf] = token;
  }

  return { tokens: root, warnings, violations };
}

// ---------------------------------------------------------------------------
// Plugin bootstrap (skipped under Node so the pure fns can be unit-tested)
// ---------------------------------------------------------------------------

if (typeof figma !== "undefined" && figma.showUI) {
  figma.showUI(__html__, { width: 440, height: 560, title: "IQM Token Exporter" });

  figma.ui.onmessage = (msg: any) => {
    if (!msg || msg.type !== "exportTokens") return;
    try {
      const read = readAllVariables();
      if (!read.variables.length) {
        figma.ui.postMessage({
          type: "result",
          ok: true,
          empty: true,
          message: "No variables found in this file.",
          warnings: read.warnings,
        });
        return;
      }
      const norm = normalizeToDTCG(read);
      for (const w of norm.warnings) console.warn("[IQM Token Exporter]", w);
      if (norm.violations.length) {
        console.warn(`[IQM Token Exporter] ${norm.violations.length} C1-bypass violation(s):`);
        for (const v of norm.violations) {
          console.warn(`  • ${v.name} (${v.collectionName}) → ${v.target} in mode(s): ${v.modes.join(", ")}`);
        }
      }
      figma.ui.postMessage({
        type: "result",
        ok: true,
        json: norm.tokens,
        warnings: norm.warnings,
        count: read.variables.length,
        violations: norm.violations,
        violationCount: norm.violations.length,
      });
    } catch (err: any) {
      console.error("[IQM Token Exporter]", err);
      figma.ui.postMessage({
        type: "result",
        ok: false,
        message: (err && err.message) || String(err),
      });
    }
  };
}

// Node test hook — only attaches when there's no Figma runtime present.
// Inside Figma `figma` is defined, so this is a no-op there.
if (typeof figma === "undefined" && typeof globalThis !== "undefined") {
  globalThis.__IQM_PLUGIN__ = {
    colorToHex,
    layerKeyFromCollection,
    toDtcgType,
    readAllVariables,
    normalizeToDTCG,
  };
}
