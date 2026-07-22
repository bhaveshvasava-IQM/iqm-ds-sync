// Validate generated exports: valid JSON/JS, parseable CSS/SCSS, TS union
// present, and cross-file token-count consistency.
//
//   node src/export/validate.js            (validates iqm-ds-sync/dist/)
//   node src/export/validate.js --out dir

import { readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, "../../dist");

function countLeaves(node) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    if ("$value" in node) return 1;
    let n = 0;
    for (const k of Object.keys(node)) n += countLeaves(node[k]);
    return n;
  }
  return 0;
}

export async function validate(outDir = DEFAULT_OUT) {
  const checks = [];
  const ok = (name, cond, detail = "") => checks.push({ name, pass: !!cond, detail });
  const read = (f) => readFile(join(outDir, f), "utf8");

  // --- tokens.json ---
  let jsonLeaves = -1;
  try {
    const tree = JSON.parse(await read("tokens.json"));
    jsonLeaves = countLeaves(tree);
    ok("tokens.json parses", true);
    ok("tokens.json has all four layers", ["primitives", "globalAlias", "systemAlias", "component"].every((k) => k in tree));
    ok("tokens.json leaves > 0", jsonLeaves > 0, `${jsonLeaves} leaves`);
  } catch (e) {
    ok("tokens.json parses", false, e.message);
  }

  // --- tokens.js (dynamic import) ---
  try {
    const mod = await import(pathToFileURL(join(outDir, "tokens.js")).href);
    ok("tokens.js is a valid ES module", typeof mod.tokens === "object" && Array.isArray(mod.tokenPaths));
    ok("tokens.js getToken works", typeof mod.getToken === "function" && mod.getToken(mod.tokenPaths[0]) !== undefined, `getToken(${mod.tokenPaths[0]})`);
    ok("tokens.js path count matches json leaves", mod.tokenPaths.length === jsonLeaves, `${mod.tokenPaths.length} vs ${jsonLeaves}`);
  } catch (e) {
    ok("tokens.js is a valid ES module", false, e.message);
  }

  // --- tokens.css ---
  try {
    const css = await read("tokens.css");
    const opens = (css.match(/{/g) || []).length;
    const closes = (css.match(/}/g) || []).length;
    const decls = (css.match(/^\s*--[a-z0-9-]+:\s*[^;]+;/gim) || []).length;
    ok("tokens.css braces balanced", opens === closes && opens >= 1, `${opens}/{ ${closes}/}`);
    ok("tokens.css declaration count matches json", decls === jsonLeaves, `${decls} vs ${jsonLeaves}`);
  } catch (e) {
    ok("tokens.css readable", false, e.message);
  }

  // --- tokens.scss ---
  try {
    const scss = await read("tokens.scss");
    // Single-line var decls only ([^;\n] stops the $iqm-tokens: ( ... ); map
    // block from being counted as one giant declaration).
    const decls = (scss.match(/^\$[a-z0-9-]+:[^;\n]+;/gim) || []).length;
    const parenOpen = (scss.match(/\(/g) || []).length;
    const parenClose = (scss.match(/\)/g) || []).length;
    ok("tokens.scss parens balanced", parenOpen === parenClose);
    ok("tokens.scss variable count matches json", decls === jsonLeaves, `${decls} vs ${jsonLeaves}`);
  } catch (e) {
    ok("tokens.scss readable", false, e.message);
  }

  // --- tokens.d.ts ---
  try {
    const dts = await read("tokens.d.ts");
    const unionMembers = (dts.match(/^\s*\|\s*".+"/gm) || []).length;
    ok("tokens.d.ts declares TokenPath", /export type TokenPath =/.test(dts));
    ok("tokens.d.ts declares getToken", /export declare function getToken/.test(dts));
    ok("tokens.d.ts union count matches json", unionMembers === jsonLeaves, `${unionMembers} vs ${jsonLeaves}`);
  } catch (e) {
    ok("tokens.d.ts readable", false, e.message);
  }

  // --- changelog.json ---
  try {
    const cl = JSON.parse(await read("changelog.json"));
    ok("changelog.json is an array", Array.isArray(cl), `${cl.length} entries`);
  } catch (e) {
    ok("changelog.json parses", false, e.message);
  }

  return checks;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--out");
  const outDir = i !== -1 && process.argv[i + 1] ? resolve(process.cwd(), process.argv[i + 1]) : DEFAULT_OUT;
  validate(outDir).then((checks) => {
    let failed = 0;
    for (const c of checks) {
      console.log(`${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
      if (!c.pass) failed++;
    }
    console.log(`\n${failed === 0 ? "✓ all" : "✗ " + failed} checks ${failed === 0 ? "passed" : "failed"} (${checks.length} total)`);
    process.exit(failed === 0 ? 0 : 1);
  });
}
