#!/usr/bin/env bash
set -euo pipefail

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$node_major" -lt 22 ]; then
  echo "Node 22 or newer is required. Found $(node -v)." >&2
  exit 1
fi

corepack enable
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi

pnpm assets:verify
pnpm dev
