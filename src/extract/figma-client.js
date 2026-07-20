// Thin wrapper around the Figma REST API for Phase 1 (component + description
// extraction). Reads credentials from .env — never hardcode the PAT or file key.
//
// This phase does NOT touch variables/tokens (that's Phase 2, via a plugin).

import 'dotenv/config';

const FIGMA_API_BASE = 'https://api.figma.com';

/**
 * Read + validate the required env vars. Throws a clear, actionable error
 * (pointing at .env) rather than letting an undefined value produce a
 * confusing HTTP failure downstream.
 *
 * @returns {{ pat: string, fileKey: string }}
 */
function getConfig() {
  const pat = process.env.FIGMA_PAT;
  const fileKey = process.env.FIGMA_FILE_KEY;

  const missing = [];
  // Treat empty / whitespace-only / untouched placeholder values as missing.
  if (!pat || !pat.trim() || pat.trim().startsWith('figd_xxx')) missing.push('FIGMA_PAT');
  if (!fileKey || !fileKey.trim() || fileKey.trim().startsWith('xxx')) missing.push('FIGMA_FILE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Figma credential(s): ${missing.join(', ')}.\n` +
        `Add them to iqm-ds-sync/.env (copy .env.example to .env and fill in real values).\n` +
        `See .env.example for the expected format.`
    );
  }

  return { pat: pat.trim(), fileKey: fileKey.trim() };
}

/**
 * Fetch the full file node tree: GET /v1/files/:file_key.
 * Returns the raw parsed JSON exactly as Figma returns it — normalization
 * happens in extract-components.js, not here.
 *
 * @returns {Promise<object>} raw Figma file JSON
 */
export async function fetchFileTree() {
  const { pat, fileKey } = getConfig();

  const url = `${FIGMA_API_BASE}/v1/files/${encodeURIComponent(fileKey)}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { 'X-Figma-Token': pat },
    });
  } catch (networkErr) {
    throw new Error(
      `Could not reach the Figma API (${url}). Check your network connection.\n` +
        `Underlying error: ${networkErr.message}`
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Figma rejected the request (HTTP ${res.status}). Your FIGMA_PAT is likely ` +
        `missing, expired, or lacks access to this file.\n` +
        `Double-check FIGMA_PAT and FIGMA_FILE_KEY in iqm-ds-sync/.env.`
    );
  }

  if (res.status === 404) {
    throw new Error(
      `Figma file not found (HTTP 404). Check that FIGMA_FILE_KEY in .env is correct — ` +
        `it's the <FILE_KEY> segment of figma.com/file/<FILE_KEY>/...`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Figma API request failed (HTTP ${res.status} ${res.statusText}).` +
        (body ? `\nResponse: ${body.slice(0, 500)}` : '')
    );
  }

  return res.json();
}
