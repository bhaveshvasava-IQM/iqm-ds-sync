// IQM Design System MCP server — exposes the iqm-ds-sync store as MCP tools +
// resources for AI agents (Claude, Cursor, Zed, …).
//
// Run over stdio:  node src/mcp/server.js   (editors spawn it this way)
// createServer() is exported for in-process testing (see cli.js selftest).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import * as queryToken from "./tools/query-token.js";
import * as listComponents from "./tools/list-components.js";
import * as getComponent from "./tools/get-component.js";
import * as findChanges from "./tools/find-changes.js";
import * as searchDs from "./tools/search-design-system.js";

import * as tokensReference from "./resources/tokens-reference.js";
import * as componentGuide from "./resources/component-guide.js";
import * as changelog from "./resources/changelog.js";
import * as architecture from "./resources/architecture.js";

const TOOLS = [
  { name: "query-token", mod: queryToken, schema: { search: z.string().describe("token path or free text"), layer: z.string().optional(), mode: z.string().optional() } },
  { name: "list-components", mod: listComponents, schema: { status: z.string().optional(), page: z.string().optional(), limit: z.number().int().positive().optional() } },
  { name: "get-component", mod: getComponent, schema: { name: z.string().describe("component name (exact or fuzzy)") } },
  { name: "find-changes", mod: findChanges, schema: { days: z.number().optional(), source: z.string().optional(), limit: z.number().optional() } },
  { name: "search-design-system", mod: searchDs, schema: { query: z.string(), type: z.enum(["token", "component", "changelog", "all"]).optional(), limit: z.number().optional() } },
];

const RESOURCES = [tokensReference, componentGuide, changelog, architecture];

export function createServer() {
  const server = new McpServer({ name: "iqm-ds-sync", version: "1.0.0" });

  for (const { name, mod, schema } of TOOLS) {
    server.registerTool(
      name,
      { description: mod.description, inputSchema: schema },
      async (args) => {
        try {
          const result = mod.run(args || {});
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return { isError: true, content: [{ type: "text", text: `Error in ${name}: ${err.message}` }] };
        }
      }
    );
  }

  for (const res of RESOURCES) {
    const { uri, name, description, mimeType } = res.meta;
    server.registerResource(
      name,
      uri,
      { description, mimeType },
      async (u) => ({ contents: [{ uri: u.href, mimeType, text: res.render() }] })
    );
  }

  return server;
}

export const toolNames = TOOLS.map((t) => t.name);
export const resourceUris = RESOURCES.map((r) => r.meta.uri);

// Connect over stdio only when invoked directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("MCP server failed to start:", err);
    process.exit(1);
  });
}
