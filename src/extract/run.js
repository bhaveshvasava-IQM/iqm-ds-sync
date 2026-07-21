// Phase 1 runner: node src/extract/run.js  (or: npm run extract:components)
//
// 1. Fetch the raw file tree from Figma.
// 2. Normalize COMPONENT / COMPONENT_SET nodes into records.
// 3. Write the result to the SQLite store (Phase 4) as a new snapshot.
// 4. Also write a local JSON copy for debugging.
// 5. Print a short summary: component count, component-set count, and any
//    nodes with an empty description (documentation gaps).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchFileTree } from './figma-client.js';
import { extractComponents } from './extract-components.js';
import { createSnapshot, writeComponents } from '../store/local-db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');

async function main() {
  console.log('→ Fetching Figma file tree...');
  const fileTree = await fetchFileTree();

  console.log('→ Extracting components...');
  const components = extractComponents(fileTree);

  // Split for the summary.
  const singles = components.filter((c) => Object.keys(c.variantProperties).length === 0);
  const sets = components.filter((c) => Object.keys(c.variantProperties).length > 0);
  const emptyDescription = components.filter((c) => !c.description || !c.description.trim());

  // Timestamp safe for filenames: 2026-07-20T11-46-05-123Z
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(OUTPUT_DIR, `components-${timestamp}.json`);

  const payload = {
    source: {
      fileName: fileTree.name ?? null,
      lastModified: fileTree.lastModified ?? null,
      version: fileTree.version ?? null,
    },
    extractedAt: new Date().toISOString(),
    counts: {
      total: components.length,
      components: singles.length,
      componentSets: sets.length,
      emptyDescription: emptyDescription.length,
    },
    components,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');

  // ---- Write to the store (the real destination; JSON above is for debugging) ----
  const snapshotId = createSnapshot('component_extract', `${components.length} components extracted`);
  const written = writeComponents(snapshotId, components);
  console.log(`\n✓ Wrote ${written} components to snapshot ${snapshotId}`);

  // ---- Console summary ----
  console.log('\n=== Extraction summary ===');
  console.log(`File:              ${fileTree.name ?? '(unknown)'}`);
  console.log(`Total nodes:       ${components.length}`);
  console.log(`  Components:      ${singles.length}`);
  console.log(`  Component sets:  ${sets.length}`);
  console.log(`Empty description: ${emptyDescription.length}`);

  if (emptyDescription.length > 0) {
    console.log('\n⚠ Documentation gaps (no native description):');
    for (const c of emptyDescription) {
      console.log(`  - ${c.name ?? '(unnamed)'}  [${c.componentId}]  (page: ${c.page ?? '?'})`);
    }
  }

  console.log(`\n✓ Wrote ${outPath}`);
}

main().catch((err) => {
  // Clean, single-line-ish failure — no stack-trace dump for expected config errors.
  console.error(`\n✗ Extraction failed:\n${err.message}`);
  process.exit(1);
});
