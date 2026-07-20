// Normalizes a raw Figma file tree (from figma-client.fetchFileTree) into
// COMPONENT records matching the shape drafted in schema/schema.md.
//
// Scope for Phase 1: components + their native descriptions only.
// We do NOT populate `status` (WIP/Shipped/Deprecated) — the Figma API doesn't
// expose it. It's left `null` and will be derived later (likely from page
// naming convention, e.g. a ❖ prefix meaning shipped).

/**
 * Extract variant property definitions from a COMPONENT_SET node.
 *
 * Figma exposes these two ways depending on API version / node:
 *  - `componentPropertyDefinitions` (preferred, richer — includes VARIANT type
 *    entries with a `variantOptions` array)
 *  - parsing child COMPONENT names ("Prop=Value, Prop2=Value2")
 * We prefer the former and fall back to the latter.
 *
 * @param {object} node a COMPONENT_SET node
 * @returns {Record<string, string[]>} map of variant property -> possible values
 */
function extractVariantProperties(node) {
  const result = {};

  const defs = node.componentPropertyDefinitions;
  if (defs && typeof defs === 'object') {
    for (const [propName, def] of Object.entries(defs)) {
      if (def && def.type === 'VARIANT' && Array.isArray(def.variantOptions)) {
        result[propName] = [...def.variantOptions];
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  // Fallback: derive from child component names of the set.
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child.type !== 'COMPONENT' || typeof child.name !== 'string') continue;
    // Names look like "Variant=Filled, Size=Medium, State=Default"
    for (const pair of child.name.split(',')) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!key) continue;
      if (!result[key]) result[key] = [];
      if (!result[key].includes(value)) result[key].push(value);
    }
  }

  return result;
}

/**
 * Walk the document tree and collect COMPONENT / COMPONENT_SET nodes as
 * normalized records. We track the top-level page (CANVAS) each node lives
 * under as we descend.
 *
 * Note: a COMPONENT that is a direct child of a COMPONENT_SET is a *variant*
 * of that set, not a standalone component — we skip those and let the set
 * represent them (its variantProperties capture the variants).
 *
 * @param {object} fileTree raw JSON from GET /v1/files/:file_key
 * @returns {object[]} array of COMPONENT records
 */
export function extractComponents(fileTree) {
  if (!fileTree || !fileTree.document) {
    throw new Error(
      'Unexpected Figma response: no `document` node found. ' +
        'The file tree may be malformed or the request may have returned an error payload.'
    );
  }

  const lastModified = fileTree.lastModified || null; // file-level timestamp
  const records = [];

  // IMPORTANT: the Figma file-tree endpoint does NOT put `.description` on the
  // COMPONENT / COMPONENT_SET nodes in the `document` tree. Descriptions live in
  // the top-level `components` / `componentSets` metadata maps, keyed by node id.
  // We enumerate from the document tree (that's what's physically in this file —
  // the maps also include remote library components) and join the description in.
  const componentMeta = fileTree.components || {};
  const componentSetMeta = fileTree.componentSets || {};

  /**
   * @param {object} node current node
   * @param {string|null} pageName top-level page this node lives under
   * @param {boolean} insideComponentSet whether the parent is a COMPONENT_SET
   */
  function walk(node, pageName, insideComponentSet) {
    if (!node || typeof node !== 'object') return;

    // CANVAS nodes are the pages; capture their name as we descend.
    const currentPage = node.type === 'CANVAS' ? node.name : pageName;

    const isComponent = node.type === 'COMPONENT';
    const isComponentSet = node.type === 'COMPONENT_SET';

    // Skip variant children of a set (they're represented by the set itself).
    if ((isComponent || isComponentSet) && !(isComponent && insideComponentSet)) {
      // Look up the native description from the metadata map; fall back to any
      // description on the node itself (defensive — not normally present here).
      const meta = isComponentSet ? componentSetMeta[node.id] : componentMeta[node.id];
      const description = (meta && meta.description) || node.description || '';

      records.push({
        componentId: node.id,
        name: node.name ?? null,
        page: currentPage ?? null,
        // Native Figma description, sourced from the file's component metadata map.
        description,
        variantProperties: isComponentSet ? extractVariantProperties(node) : {},
        // Per-node timestamp isn't in the file-tree response; fall back to the
        // file-level lastModified so downstream has *a* timestamp to work with.
        lastModified,
        // Not exposed by the Figma API — deferred (see module header).
        status: null,
      });
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      walk(child, currentPage, isComponentSet);
    }
  }

  walk(fileTree.document, null, false);
  return records;
}
