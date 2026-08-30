#!/usr/bin/env bash
set -euo pipefail
PNPM_DSH="${HOME}/.local/bin/pnpm-dsh"
PNPM_SHIM="/tmp/opute-pnpm-path"
mkdir -p "$PNPM_SHIM"
ln -sfn "$PNPM_DSH" "$PNPM_SHIM/pnpm"
export PATH="${PNPM_SHIM}:/usr/bin:/bin:${HOME}/.bun/bin"
export OPUTE_MCP_ENDPOINT="${OPUTE_MCP_ENDPOINT:-http://127.0.0.1:9091/mcp}"
cd /home/houman/github/wunderous/opute-harness
exec node scripts/launch-opute-web.js "$@"
