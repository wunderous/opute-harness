# Opute Harness

Opute **plugin suite** for [harness.opute.io](https://harness.opute.io).

This is not a fork of upstream DSH and not a move of `platform.opute.io/chat`.
The Platform chat UI stays on Opute. This process boots `dsh --profile opute-web`,
connects to [mcp.opute.io](https://mcp.opute.io) over Streamable HTTP, and
disables host-local bash/fs tools. The Opute overlay owns the visible marks and
system instructions, and the DSH build is given the Opute document title; DSH
remains the execution runtime. Static PWA assets and conversation copy remain
web-shell inputs until a thin web-surface fork owns them.

## Run (loopback)

1. Install upstream DSH (`dsh` on `PATH`), or use the sibling checkout `../deepseek-harness` (`pnpm dsh`).
2. Add the bundle to a profile:

   ```sh
   dsh plugin --profile opute-web add ./packages/bundle-opute-web
   ```

3. Point at MCP and start on loopback:

   ```sh
   export OPUTE_MCP_ENDPOINT=http://127.0.0.1:9091/mcp
   export OPUTE_MCP_TOKEN=…          # opat_* or MCP_AUTH_TOKEN
   export OPUTE_HARNESS_PRESET_ROOT="$PWD/packages/bundle-opute-web/presets"
   pnpm start
   ```

   The GUI listens on `http://127.0.0.1:3080`. Open the printed `dsh web:` URL
   (it carries a process token) when testing locally. Do not pass
   `--host 0.0.0.0`.

Public hosting is Cloudflare Tunnel → `127.0.0.1:3080` with
`--trusted-host harness.opute.io`. See [deploy/README.md](deploy/README.md).
The managed public recipe configures DSH with
`publicUrl: https://harness.opute.io/` and explicitly enables hosted public
entry for that dedicated authority. A fresh browser can open the bare public
root, choose **Open Harness**, and land on the clean authenticated GUI. The
process-token URL remains a local/operator diagnostic and is never required
for public access.

## CI test contract

The committed test suite is deterministic: it does not call an LLM, Ollama,
OpenRouter, or any other provider, so GitHub Actions does not need an AI secret.
Provider-backed model behavior belongs in a separate opt-in lane; when one is
added, use the approved OpenRouter `ibm/granite4.1:3b` route rather than a
local model.

`pnpm verify:coexistence` additionally checks a sibling Platform checkout and
the public chat origin, so it remains an operator/local integration gate. Its
unit test skips honestly in a standalone GitHub checkout where `../opute` is
not present.

## Layout

```
packages/bundle-opute-web/     DSH bundle (cordis.patch.yml + opute preset)
packages/plugin-mcp-opute/     MCP env guard
packages/plugin-tool-lockdown/ deny non-Opute MCP tools at execute time
packages/client-ui-opute/      inventory tool cards (slot keys)
```
