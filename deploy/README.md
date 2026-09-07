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

## K3s deployment

The supported two-node validation deployment is
[`k8s/harness-dsh.yaml`](k8s/harness-dsh.yaml). It runs the maintained DSH
image and a pinned Cloudflare connector in one pod. Granite 4.2 is requested
from OpenRouter through a Kubernetes Secret; there is no node-local model
proxy or Ollama dependency. DSH still binds only to the pod loopback; the
connector's existing ingress remains `harness.opute.io` to
`http://127.0.0.1:3080`.

Build an image from a context containing sibling `opute-harness/` and
`deepseek-harness/` directories with `Dockerfile.k8s`, import it into the
selected K3s node's `k8s.io` containerd namespace, then create the two
runtime-only Secrets before applying the manifest:

```sh
kubectl create namespace opute-harness
kubectl create secret generic opute-harness-mcp --namespace opute-harness \
  --from-literal=token="$OPUTE_MCP_TOKEN"
kubectl create secret generic opute-harness-openrouter --namespace opute-harness \
  --from-literal=apiKey="$OPENROUTER_API_KEY"
kubectl create secret generic opute-harness-tunnel --namespace opute-harness \
  --from-file=token="$OPUTE_HARNESS_TUNNEL_TOKEN_FILE"
kubectl apply -f deploy/k8s/harness-dsh.yaml
```

The token values are intentionally absent from the repository. Run
`pnpm validate:k8s-harness` with the target K3s `kubectl` context to require
two Ready nodes, a Ready Harness pod, the public MCP endpoint, a
Secret-backed OpenRouter key, and the Cloudflare sidecar. Follow that with
`pnpm validate:public-granite42` for the external exact-model acceptance;
the acceptance probe selects `openrouter/ibm-granite/granite-4.2-8b` and
blocks when OpenRouter does not advertise that exact model. HTTP health alone
is not an end-to-end pass.
