#!/usr/bin/env bash
set -euo pipefail
PNPM_DSH="${HOME}/.local/bin/pnpm-dsh"
PNPM_SHIM="/tmp/opute-pnpm-path"
mkdir -p "$PNPM_SHIM"
ln -sfn "$PNPM_DSH" "$PNPM_SHIM/pnpm"
export PATH="${PNPM_SHIM}:/usr/bin:/bin:${HOME}/.bun/bin"
export DSH_CLIENT_TITLE="${DSH_CLIENT_TITLE:-Opute}"
cd /home/houman/github/wunderous/deepseek-harness
"$PNPM_DSH" install
"$PNPM_DSH" run build
