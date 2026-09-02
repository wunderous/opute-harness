# Opute Harness deploy

DSH must listen on **127.0.0.1:3080**. `dsh web --host 0.0.0.0` is rejected by
upstream (RCE). Cloudflare Tunnel (or a sidecar) is the only public path.

```sh
dsh --profile opute-web --no-open --port 3080 --trusted-host harness.opute.io
```

Env:

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPUTE_MCP_ENDPOINT` | `http://127.0.0.1:9091/mcp` | Streamable HTTP MCP URL |
| `OPUTE_MCP_TOKEN` | (empty) | Bearer `opat_*` or cell token |
| `OPUTE_HARNESS_PRESET_ROOT` | set by `pnpm start` | Absolute path to `presets/` |
| `OPUTE_HARNESS_REQUIRE_MCP` | unset | `1` fails boot without token |

Public hostname `harness.opute.io` is a **dedicated host-local Cloudflare
tunnel**, not an extra hostname on the in-cluster `platform.opute.io` /
`mcp.opute.io` connector. Unroll with
[`recipes/harness-opute-io.unroll.yaml`](../recipes/harness-opute-io.unroll.yaml),
then apply [`recipes/harness-opute-io.yaml`](../recipes/harness-opute-io.yaml)
(`tunnel-recipe.v1` / `host-plan.v1`) through the enrolled Host Agent
(`run_tunnel_recipe`). Do not orchestrate systemd or Cloudflare from
TypeScript. DSH owns conversation location `key`; overlay still sets
`key === kind` for older DSH.

DSH `/` is a protected 401 entry page without the browser-session cookie, so
the recipe probes `/favicon.svg` (200). At the dedicated public hostname the
page provides an **Open Harness** button that performs the same-origin hosted
entry action; users do not need local terminal access or a copied `dsh web`
URL. Ordinary local DSH sessions still use the process-token URL.

Put Cloudflare Access (or equivalent) in front of the Host API. DSH still uses
its process-launch cookie internally.
