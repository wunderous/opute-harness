# Opute Harness Agent Guide

Sibling of `opute/` and `opute-host-agent/`. This repository publishes the
**Opute web profile** (a DSH overlay) for `https://harness.opute.io`, not a
fork of upstream DSH and not a lift of `platform.opute.io/chat`.

## Ownership

- **Platform** (`../opute`) owns durable intent, MCP Host, and `https://platform.opute.io/chat`.
- **This repo** owns the `opute-web` DSH profile: MCP client row, tool lockdown,
  inventory cards, implicit workspace seed (no folder picker), and the
  `tunnel-recipe.v1` DAG for `https://harness.opute.io`
  ([`recipes/harness-opute-io.yaml`](recipes/harness-opute-io.yaml)).
- **Do not** bind `dsh web --host 0.0.0.0` (DSH rejects it; it would expose RCE).
  Cloudflare Tunnel must reach `127.0.0.1:3080`.

## Packages

| Package | Role |
|---------|------|
| `@opute/dsh-bundle-opute-web` | Bundle patch: MCP row, agent-presets default, UI plugin insert |
| `@opute/dsh-plugin-mcp-opute` | 2026-07-28 Streamable HTTP client; registers `mcp__opute__*` |
| `@opute/dsh-plugin-tool-retrieval` | Dense+lexical top-N tool surface (`dense-lexical-rank-fusion-v1`). Ranking is advisory (rank-1 is order; `toolChoice` stays auto). Query is the last claimed user text only — no last-N conversation tail. Generated `queryVariants` are document-side views. Emits UI-only `opute/execution-trace` (one log event per assemble stage: query, scores, named context sizes). |
| `@opute/dsh-plugin-tool-lockdown` | `tools/pre-execute` allowlist: `mcp__opute__*` only |
| `@opute/dsh-plugin-workspace-seed` | Implicit `$DSH_HOME/opute-workspace` so sessions need no folder picker |
| `@opute/dsh-plugin-system-prompt` | DSH settings namespace `opute-system-prompt` (`instructions`). Default is Opute Assistant identity (complete section); Settings → Plugins edits the user layer. |
| `@opute/dsh-client-ui-opute` | Session rail (no workspace chrome) + inventory cards / MCP Apps iframe + Execution Trace header + Trajectory assemble-stage rows |

## MCP Apps

Stock DSH (`dsh-mcp-client` / `ui-tool`) has no Opute inventory cards. This overlay adds them without forking DSH or lifting `platform.opute.io/chat`:

- `client-ui-opute` ports Platform's `VmSummaryCard` layout into the turn tail for `list_vms` / `list_managed_vms` (snapshot of the tool payload, including flattened durable `metadata` stats). The tool-call row stays a one-line summary. No live `InfrastructureContext`, no VM detail routes. DSH owns conversation location `key` (`definition.kind`); overlay still sets `key: 'opute-vm-inventory'` for older DSH until the sibling bump.
- `plugin-mcp-opute` still advertises `io.modelcontextprotocol/ui` and prefetches `ui://opute/vm-inventory` into `presentationMeta`. Other inventory tools keep the list card.

The Opute profile ships **Opute Assistant identity** as the complete system-prompt section (host-plane DSH identity, checkout, web-surface, and deliverable rows stay off). User-authored edits live in the `opute-system-prompt` settings namespace and the Settings → Plugins card. Inventory routing lives in tool descriptions and ranking, not the system prompt. For “list the clusters/VMs”, the model should call `mcp__opute__host__list_clusters` / `mcp__opute__host__list_vms` with `{}` or `{fast}` — **no `hostId`**. Rank-1 `mcp__opute__platform__list_managed_*` is advisory; that path hits Platform Postgres and can `ECONNREFUSED` while `/vms` and live host inventory still work. Do not document bash/`hostId` recovery for Host Agent tools. Assemble diagnostics (`opute/execution-trace`) are UI-only: session-header Execution Trace plus Trajectory context rows (one per assemble stage). They must not be written back into PromptAssembly. Ranking stays advisory. Chrome branding (sidebar/hero mark, wordmark, document title, favicon, welcome copy) is the `ui-opute` overlay; do not remount `ui-brand-official`.

## Launch

```sh
# Product bearer: opsess_* / opat_* / CPC. Never Host Agent MCP_AUTH_TOKEN (oha_ / opit_ / opha_).
export OPUTE_MCP_ENDPOINT="${OPUTE_MCP_ENDPOINT:-https://mcp.opute.io/mcp}"
export OPUTE_MCP_TOKEN="opsess_…"
pnpm start
# equivalent: node scripts/launch-opute-web.js
```

`scripts/launch-opute-web.js` hydrates from sibling `opute/.env`, then the live Host Agent `host-agent.env`, then `opute/tmp/dogfood-milestones/mcp-bearer.cache.json`. Host-scoped `oha_` / `opit_` / `opha_` tokens are not product MCP bearers (`list_managed_vms` returns Unauthorized). When `OPUTE_MCP_ENDPOINT` is unset, WSL `:9091` is down, and a product token exists, launch fails over to `https://mcp.opute.io/mcp`. An explicit endpoint is never rewritten. Loopback `:9091` + `dev-token` is local-dev only.

Public exposure is Host Agent recipe DAGs: unroll
[`recipes/harness-opute-io.unroll.yaml`](recipes/harness-opute-io.unroll.yaml)
then apply [`recipes/harness-opute-io.yaml`](recipes/harness-opute-io.yaml)
(`tunnel-recipe.v1` / `host-plan.v1`). Apply installs DSH as a user systemd
unit and a dedicated WSL connector for `harness.opute.io` → `127.0.0.1:3080`.
Do not add this hostname to the in-cluster platform/mcp tunnel. Recipes probe
`/favicon.svg` because DSH `/` is 401 without the process-launch cookie.
Public sessions still need `https://harness.opute.io/?token=<launch-token>`
from `~/.config/opute/harness-opute-dsh.launch-token`.

`pnpm start` runs `dsh web --patch packages/bundle-opute-web/cordis.patch.yml`
from the sibling `../deepseek-harness` checkout (the `web` profile includes
`dsh-web-app`). A custom `opute-web` profile does not serve the GUI unless
that bundle is on its list.

Requires DSH `apps/web/dist` (`pnpm run build` in `deepseek-harness` once).
Optional durable profile:

```sh
dsh plugin --profile opute-web add ./packages/bundle-opute-web
dsh --profile opute-web --dump-config
```

## Compaction

The Opute agent preset (`packages/bundle-opute-web/presets/opute/agent.cordis.yml`) mounts the shipped compaction isolate (`compaction-basic`, `command-compact`, `tool-result-pruner`) so long chats prune oversized tool results. `compaction-basic` is `auto: false`: a 4B must not LLM-summarize history on pressure; `/compact` is the hatch. Do not put those ids on the overlay patches (web-app already disabled the host copies so the **agent isolate** owns them). Token meter stays on the host plane.

## Verification

```sh
pnpm test
pnpm verify:lockdown
pnpm verify:coexistence
```

Lockdown asserts ranking fusion identity, the compaction isolate (`auto: false`), and loopback bind policy (`127.0.0.1:3080` — never `--host 0.0.0.0`).
