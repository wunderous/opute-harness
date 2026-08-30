#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/bin:${HOME}/.local/bin"
pkill -f 'probe-unrun.sh' 2>/dev/null || true
mkdir -p "${HOME}/.local/bin" /tmp/pnpm-dsh
cd /tmp/pnpm-dsh
curl -fsSL -o pnpm-linux-x64.tar.gz "https://github.com/pnpm/pnpm/releases/download/v11.7.0/pnpm-linux-x64.tar.gz"
tar -xzf pnpm-linux-x64.tar.gz
chmod +x pnpm
cp -a pnpm dist "${HOME}/.local/pnpm-dsh" 2>/dev/null || {
  mkdir -p "${HOME}/.local/pnpm-dsh"
  cp -a pnpm "${HOME}/.local/pnpm-dsh/pnpm"
  if [[ -d dist ]]; then cp -a dist "${HOME}/.local/pnpm-dsh/dist"; fi
}
ln -sfn "${HOME}/.local/pnpm-dsh/pnpm" "${HOME}/.local/bin/pnpm-dsh"
"${HOME}/.local/bin/pnpm-dsh" --version
ls -la /tmp/pnpm-dsh | head
