# `@opute/dsh-plugin-mcp-opute`

2026-07-28 stateless Streamable HTTP client for Opute MCP. Registers tools as
`mcp__opute__<wireName>` on the DSH tool runtime.

Stock `@deepseek-ai/dsh-mcp-client` uses SDK v1 `Client.connect()` /
`initialize`. Opute rejects that handshake. This plugin POSTs `tools/list` and
`tools/call` with `MCP-Protocol-Version: 2026-07-28` and the modern `_meta`
envelope. It never sends `Mcp-Session-Id`. Long-running calls that return a
Tasks handle are polled with `tasks/get`.

Required env:

- `OPUTE_MCP_ENDPOINT` — default `http://127.0.0.1:9091/mcp`
- `OPUTE_MCP_TOKEN` (or `MCP_AUTH_TOKEN` / `OPUTE_CPC_TOKEN`)

Set `OPUTE_HARNESS_REQUIRE_MCP=1` to fail plugin activation when the list
fails or the token is missing.

## Host Agent kernels

Platform tools stay on `mcp__opute__*`. When a local Host Agent is reachable
with an `oha_` token **and** `OPUTE_MCP_PREFIX_TOOL_NAMES=true`, this plugin
also registers that kernel as `mcp__h{prefix}__{catalogName}`. Unprefixed
`tools/list` catalogs are skipped. Do not enable the prefix flag on
Platform-enrolled instances; do not send `opsess_` / `opha_` / `opit_` to
host `/mcp`.

## Inventory routing

`@opute/dsh-plugin-tool-retrieval` projects the dense+lexical top-N surface.
This plugin still:

- Omits `lxc_*` CLI tools and host-only ops (`diagnose_bridge`, …) from the
  DSH registry (they are not on Platform's authorized catalog).
- Rewrites descriptions for `list_managed_vms`, `list_vms`, and `list_agents`.
- Adds an `opute:inventory` system-prompt section that names
  `mcp__opute__platform__list_managed_vms` as the global VM list.
- Compacts `list_agents` / `list_vms` observations so capability catalogs
  never enter the next turn.
