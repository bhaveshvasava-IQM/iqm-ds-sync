// Exporter unit tests: node src/export/export.test.js
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { exportCss } from "./exporters/css.js";
import { exportScss } from "./exporters/scss.js";
import { exportJson } from "./exporters/json.js";
import { exportJavascript } from "./exporters/javascript.js";
import { exportTypescript } from "./exporters/typescript.js";
import { varName, resolveConcrete, byDottedMap } from "./exporters/_shared.js";

// Flat store-shaped rows, incl. a 2-hop alias chain, a dimension, and a boolean.
const T = [
  { tokenPath: "primitives/theme-600", layer: "Primitives", $value: "#215EE5", $type: "color", $description: "blue 600", modes: ["Blue"], $extensions: { "com.iqm.figma": { variableId: "V1" } } },
  { tokenPath: "primitives/spacing/300", layer: "Primitives", $value: "16", $type: "dimension", $description: "16px", modes: ["Blue"], $extensions: {} },
  { tokenPath: "globalAlias/primary-600", layer: "Global Alias", $value: "{primitives.theme-600}", $type: "color", $description: null, modes: ["Light", "Dark"], $extensions: {} },
  { tokenPath: "component/button/filled/bg", layer: "Component", $value: "{globalAlias.primary-600}", $type: "color", $description: null, modes: ["Default"], $extensions: { "com.iqm.figma": { c1BypassChecked: true } } },
  { tokenPath: "component/Summary", layer: "Component", $value: "false", $type: "boolean", $description: null, modes: ["Default"], $extensions: {} },
];

let passed = 0;
const failures = [];
const check = (name, cond) => { if (cond) passed++; else { failures.push(name); console.error("  ✗ " + name); } };

// --- shared ---
check("varName kebabs the layer key", varName("globalAlias/primary-600") === "global-alias-primary-600");
check("resolveConcrete follows the chain", resolveConcrete(T[3], byDottedMap(T)) === "#215EE5");

// --- CSS ---
const css = exportCss(T);
check("css: primitive literal", css.includes("--primitives-theme-600: #215EE5;"));
check("css: alias -> var()", css.includes("--global-alias-primary-600: var(--primitives-theme-600);"));
check("css: component -> system var()", css.includes("--component-button-filled-bg: var(--global-alias-primary-600);"));
check("css: 5 declarations", (css.match(/^\s*--[a-z0-9-]+:/gm) || []).length === 5);

// --- SCSS (aliases flattened to concrete) ---
const scss = exportScss(T);
check("scss: alias flattened one hop", scss.includes("$global-alias-primary-600: #215EE5;"));
check("scss: alias flattened two hops", scss.includes("$component-button-filled-bg: #215EE5;"));
check("scss: has lookup map", scss.includes("$iqm-tokens: ("));

// --- JSON (coercion + alias preserved) ---
const tree = JSON.parse(exportJson(T));
check("json: dimension coerced to number", tree.primitives.spacing["300"].$value === 16);
check("json: boolean coerced", tree.component.Summary.$value === false);
check("json: alias kept as reference", tree.globalAlias["primary-600"].$value === "{primitives.theme-600}");
check("json: extensions preserved", tree.primitives["theme-600"].$extensions["com.iqm.figma"].variableId === "V1");

// --- TypeScript ---
const ts = exportTypescript(T);
check("ts: TokenPath union member", ts.includes('| "globalAlias.primary-600"'));
check("ts: 5 union members", (ts.match(/^\s*\|\s*".+"/gm) || []).length === 5);
check("ts: getToken declared", /export declare function getToken/.test(ts));

// --- JS (write + import, exercise getToken) ---
const dir = mkdtempSync(join(tmpdir(), "iqm-export-test-"));
try {
  const jsPath = join(dir, "tokens.js");
  writeFileSync(jsPath, exportJavascript(T), "utf8");
  const mod = await import(pathToFileURL(jsPath).href);
  check("js: tokenPaths length 5", mod.tokenPaths.length === 5);
  check("js: getToken resolves $value", mod.getToken("primitives.theme-600") === "#215EE5");
  check("js: getToken on alias returns ref", mod.getToken("globalAlias.primary-600") === "{primitives.theme-600}");
  check("js: getToken dimension is number", mod.getToken("primitives.spacing.300") === 16);
  check("js: getToken unknown -> undefined", mod.getToken("nope.nope") === undefined);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length === 0) {
  console.log(`\n✓ ${passed} tests passed`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
