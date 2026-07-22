# IQM Design System — MCP server (Phase 8)

An [MCP](https://modelcontextprotocol.io) server that exposes the `iqm-ds-sync`
store as **tools** and **resources** for AI agents (Claude Desktop, Cursor, Zed,
…). Teams point their editor at this server and ask design questions in natural
language — **no Figma required**. It reads the local SQLite store; it never
touches Figma or the network.

## Tools (actions the agent calls)

| Tool | What it does |
|------|--------------|
| `query-token` | Search/fetch tokens; resolves the full alias chain on exact matches. Filters: `layer`, `mode`. |
| `list-components` | Browse the catalog. Filters: `status`, `page`, `limit`. |
| `get-component` | Full detail for one component (variants, recent changes, docs link). |
| `find-changes` | Recent diffs (between same-source snapshots). Filters: `days`, `source`, `limit`. |
| `search-design-system` | Full-text search across tokens + components, ranked. |

## Resources (reference docs the agent reads)

| URI | Contents |
|-----|----------|
| `iqm://tokens/reference` | Full token catalog by layer. |
| `iqm://components/guide` | Component catalog by page. |
| `iqm://changelog` | Recent changes. |
| `iqm://architecture` | Four-layer token model + how to query this server. |

## Run it

```bash
npm run mcp            # start the server over stdio (how editors launch it)
npm run mcp:selftest   # in-memory client↔server round-trip (no editor needed)
npm run test:mcp       # tool-logic unit tests against the store
```

Manual poking without an editor:

```bash
node src/mcp/cli.js list
node src/mcp/cli.js call query-token '{"search":"component/button/filled/bg"}'
node src/mcp/cli.js resource architecture
```

## Connect an editor

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iqm-ds": {
      "command": "node",
      "args": ["/Users/bhaveshvasava/iqm-ds-sync/src/mcp/server.js"]
    }
  }
}
```

**Cursor** — add the same under `mcpServers` in Cursor's MCP settings. Then ask:
_"What's the focus-ring token?"_, _"List shipped components"_, _"What does
component/button/filled/bg resolve to?"_

## Known limits

- **No usage bindings.** Token↔component links aren't captured in the store, so
  `query-token.whereUsed` and `get-component.tokensUsed` are `null`.
- **Default-mode values only.** Each token carries its default-mode value plus
  mode *names*; distinct Light/Dark values aren't stored, so `mode` filters by
  availability, not by distinct value.
- **Changelog needs history.** `find-changes` / the changelog resource compare
  same-source snapshots; empty until a second extract/import of a given source.
