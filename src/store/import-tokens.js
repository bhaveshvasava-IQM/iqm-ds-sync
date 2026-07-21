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
 * original DTCG fields and gains a `tokenPath` built from its key path.
 * writeTokens() derives tokenId/layer/modes from $extensions when absent.
 */
function flattenTokens(root) {
  const out = [];
  function walk(node, path) {
    if (isToken(node)) {
      out.push({ ...node, tokenPath: path.join("/") });
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
