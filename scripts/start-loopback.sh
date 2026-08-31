#!/usr/bin/env bash
# Boot dsh web on 127.0.0.1:3080 with the Opute bundle overlay.
# Use the standalone pnpm 11 binary as `pnpm` so nested DSH scripts do not
# hit corepack's broken Node 22 loader.
set -euo pipefail
PNPM_DSH="${HOME}/.local/bin/pnpm-dsh"
PNPM_SHIM="/tmp/opute-pnpm-path"
mkdir -p "$PNPM_SHIM"
ln -sfn "$PNPM_DSH" "$PNPM_SHIM/pnpm"
export PATH="${PNPM_SHIM}:/usr/bin:/bin:${HOME}/.bun/bin"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_ROOT="${DSH_ROOT:-$ROOT/../deepseek-harness}"
cd "$ROOT"

if [[ ! -d node_modules/@opute ]]; then
  node /usr/share/nodejs/corepack/dist/pnpm.js install
fi

if [[ ! -f "$DSH_ROOT/apps/web/dist/index.html" ]]; then
  echo "opute-harness: building sibling DSH frontend (once)"
  bash "$ROOT/scripts/build-dsh.sh"
fi

exec node scripts/launch-opute-web.js "$@"
