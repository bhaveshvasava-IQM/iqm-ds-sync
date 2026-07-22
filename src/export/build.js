// Phase 7 orchestrator: read the store, run every exporter, write dist/.
//
//   node src/export/build.js               -> writes to iqm-ds-sync/dist/
//   node src/export/build.js --out public  -> writes to <cwd>/public (docs integration)
//
// Also exported as build(outDir) for programmatic use (see index.js).

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { listSnapshots, getAllTokens } from "../store/local-db.js";
import { exportCss } from "./exporters/css.js";
import { exportScss } from "./exporters/scss.js";
import { exportJson } from "./exporters/json.js";
import { exportJavascript } from "./exporters/javascript.js";
import { exportTypescript } from "./exporters/typescript.js";
import { exportChangelog } from "./exporters/changelog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = resolve(__dirname, "../../dist");

// Newest snapshot that actually contains tokens (components/tokens live in
// separate snapshots, so the overall-latest snapshot may have none).
function latestTokens() {
  for (const s of listSnapshots()) {
    const toks = getAllTokens(s.snapshot_id);
    if (toks.length) return toks;
  }
  return [];
}

export async function build(outDir = DEFAULT_OUT) {
  const tokens = latestTokens();
  if (!tokens.length) {
    throw new Error("No tokens in the store. Run `npm run import:tokens -- <file>` first.");
  }

  const files = {
    "tokens.css": exportCss(tokens),
    "tokens.scss": exportScss(tokens),
    "tokens.json": exportJson(tokens),
    "tokens.js": exportJavascript(tokens),
    "tokens.d.ts": exportTypescript(tokens),
    "changelog.json": exportChangelog(10),
  };

  await mkdir(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(outDir, name), content, "utf8");
  }
  return { outDir, tokenCount: tokens.length, files: Object.keys(files) };
}

function parseOut(argv) {
  const i = argv.indexOf("--out");
  if (i !== -1 && argv[i + 1]) return resolve(process.cwd(), argv[i + 1]);
  return DEFAULT_OUT;
}

// Run when invoked directly (robust main-module check).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build(parseOut(process.argv.slice(2)))
    .then((r) => {
      console.log(`✓ Exported ${r.tokenCount} tokens → ${r.outDir}`);
      for (const f of r.files) console.log(`  - ${f}`);
    })
    .catch((err) => {
      console.error(`✗ Export failed: ${err.message}`);
      process.exit(1);
    });
}
