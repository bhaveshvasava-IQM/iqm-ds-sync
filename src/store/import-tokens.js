// Import Phase 2 plugin token output into the store.
//
//   node src/store/import-tokens.js <path-to-json-file>
//   (or: npm run import:tokens -- <path-to-json-file>)
//
// The plugin exports a NESTED DTCG structure, e.g.
//   { "primitives": { "color": { "blue": { "600": { "$value": ... } } } },
//     "globalAlias": { ... }, "systemAlias": { ... }, "component": { ... } }
// writeTokens() expects a FLAT array of token rows, so we flatten here and
// derive `tokenPath` from the key path (e.g. "primitives/color/blue/600").

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createSnapshot, writeTokens } from "./local-db.js";

// Map the plugin's top-level layer key onto the store's layer label.
const LAYER_MAP = {
  primitives: "Primitives",
  globalAlias: "Global Alias",
  systemAlias: "System Alias",
  component: "Component",
};

// A node is a token leaf if it carries any DTCG marker key.
function isToken(node) {
  return (
    node != null &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    ("$value" in node || "$type" in node || "$extensions" in node)
  );
}

/**
 * Walk the nested structure and collect flat token rows. Each leaf keeps its
 * original DTCG fields and gains:
 *   - tokenPath: the "/"-joined key path from root to leaf
 *   - layer: mapped from the top-level key (primitives → "Primitives", …)
 * `layer` is only set when the top-level key is recognized; otherwise it's
 * left off so writeTokens() can fall back to $extensions.com.iqm.figma.
 * tokenId/modes continue to come from $extensions via writeTokens().
 */
function flattenTokens(root) {
  const out = [];
  function walk(node, path) {
    if (isToken(node)) {
      const layer = LAYER_MAP[path[0]];
      const flat = { ...node, tokenPath: path.join("/") };
      if (layer) flat.layer = layer;
      out.push(flat);
      return;
    }
    if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const key of Object.keys(node)) {
        walk(node[key], path.concat(key));
      }
    }
  }
  walk(root, []);
  return out;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node src/store/import-tokens.js <path-to-json-file>");
    process.exit(1);
  }

  const abs = resolve(filePath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    console.error(`✗ Couldn't read/parse "${abs}": ${err.message}`);
    console.error("  Usage: node src/store/import-tokens.js <path-to-plugin-token-export.json>");
    process.exit(1);
  }

  // Accept either an already-flat array, a { tokens: {...} } wrapper, or the
  // raw nested structure the plugin emits.
  let tokensArray;
  if (Array.isArray(parsed)) {
    tokensArray = parsed;
  } else if (parsed && typeof parsed === "object" && parsed.tokens && typeof parsed.tokens === "object") {
    tokensArray = flattenTokens(parsed.tokens);
  } else {
    tokensArray = flattenTokens(parsed);
  }

  if (!tokensArray.length) {
    console.error(`✗ No tokens found in "${abs}". Expected the plugin's nested DTCG export or a flat token array.`);
    process.exit(1);
  }

  try {
    const snapshotId = createSnapshot("token_plugin", "exported from Figma plugin");
    const written = writeTokens(snapshotId, tokensArray);
    console.log(`✓ Wrote ${written} tokens to snapshot ${snapshotId}`);
  } catch (err) {
    console.error(`✗ Import failed: ${err.message}`);
    process.exit(1);
  }
}

main();
