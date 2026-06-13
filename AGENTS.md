# translator Project Instructions

## MCP Tool Usage

Do not use `list_mcp_resources` or `read_mcp_resource` to access `filesystem`, `memory`, or `playwright` MCP servers. These servers may not implement MCP resources and can return `Method not found`.

Use the server-specific tools instead:
- Filesystem reads: `mcp__filesystem__read_text_file`, `mcp__filesystem__list_directory`, `mcp__filesystem__search_files`.
- Memory reads: `mcp__memory__search_nodes`, `mcp__memory__read_graph`.
- Playwright browser actions: `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_click`, and related browser tools.

If a `read_mcp_resource` call fails with `resources/read failed` or `Mcp error: -32601: Method not found`, retry with the matching server-specific tool rather than repeating the resource call.
