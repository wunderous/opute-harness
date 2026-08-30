#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/bin"
# Restart only the harness listener; do not touch Platform :9091.
if command -v fuser >/dev/null; then
  fuser -k 3080/tcp 2>/dev/null || true
else
  pids=$(ss -tlnp 2>/dev/null | awk '/:3080 / {print}' || true)
  echo "$pids"
fi
sleep 1
ss -tln | grep 3080 || echo '3080-free'
