// Local tester for the MCP server.
//
//   node src/mcp/cli.js list                         list tools + resources
//   node src/mcp/cli.js call <tool> '<json-args>'    run a tool directly
//   node src/mcp/cli.js resource <name>              print a resource
//   node src/mcp/cli.js selftest                     in-memory MCP round-trip
//
// `selftest` connects a real MCP Client to the server over an in-memory
// transport and exercises listTools/callTool/listResources/readResource — a
// full end-to-end check without an external editor.

import { pathToFileURL } from "node:url";
import * as queryToken from "./tools/query-token.js";
import * as listComponents from "./tools/list-components.js";
import * as getComponent from "./tools/get-component.js";
import * as findChanges from "./tools/find-changes.js";
import * as searchDs from "./tools/search-design-system.js";
import * as tokensReference from "./resources/tokens-reference.js";
import * as componentGuide from "./resources/component-guide.js";
import * as changelog from "./resources/changelog.js";
import * as architecture from "./resources/architecture.js";

const TOOLS = {
  "query-token": queryToken,
  "list-components": listComponents,
  "get-component": getComponent,
  "find-changes": findChanges,
  "search-design-system": searchDs,
};
const RESOURCES = { "tokens-reference": tokensReference, "component-guide": componentGuide, changelog, architecture };

async function selftest() {
  const { createServer } = await import("./server.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

  const server = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "selftest", version: "1.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  let passed = 0;
  const fail = [];
  const check = (n, c) => (c ? passed++ : fail.push(n));

  const tools = await client.listTools();
  check("lists 5 tools", tools.tools.length === 5);

  const qt = await client.callTool({ name: "query-token", arguments: { search: "primitives/theme-600" } });
  const qtData = JSON.parse(qt.content[0].text);
  check("query-token exact hit + alias chain", qtData.exact && Array.isArray(qtData.exact.resolvedChain));

  const lc = await client.callTool({ name: "list-components", arguments: { limit: 5 } });
  check("list-components returns rows", JSON.parse(lc.content[0].text).components.length === 5);

  const sd = await client.callTool({ name: "search-design-system", arguments: { query: "focus" } });
  check("search returns ranked results", JSON.parse(sd.content[0].text).count > 0);

  const resources = await client.listResources();
  check("lists 4 resources", resources.resources.length === 4);

  const arch = await client.readResource({ uri: "iqm://architecture" });
  check("architecture resource renders", arch.contents[0].text.includes("Four-layer token architecture"));

  await client.close();
  await server.close();

  for (const f of fail) console.error("  ✗ " + f);
  console.log(`\n${fail.length === 0 ? "✓" : "✗"} MCP round-trip: ${passed} passed, ${fail.length} failed`);
  process.exit(fail.length === 0 ? 0 : 1);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "selftest") return selftest();

  if (cmd === "list") {
    console.log("Tools:");
    for (const [name, mod] of Object.entries(TOOLS)) console.log(`  ${name} — ${mod.description.slice(0, 80)}…`);
    console.log("\nResources:");
    for (const mod of Object.values(RESOURCES)) console.log(`  ${mod.meta.uri} (${mod.meta.name})`);
    return;
  }
  if (cmd === "call") {
    const mod = TOOLS[a];
    if (!mod) { console.error(`Unknown tool "${a}". Try: ${Object.keys(TOOLS).join(", ")}`); process.exit(1); }
    const args = b ? JSON.parse(b) : {};
    console.log(JSON.stringify(mod.run(args), null, 2));
    return;
  }
  if (cmd === "resource") {
    const mod = RESOURCES[a];
    if (!mod) { console.error(`Unknown resource "${a}". Try: ${Object.keys(RESOURCES).join(", ")}`); process.exit(1); }
    console.log(mod.render());
    return;
  }
  console.log("Usage: node src/mcp/cli.js <list|call <tool> '<json>'|resource <name>|selftest>");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
