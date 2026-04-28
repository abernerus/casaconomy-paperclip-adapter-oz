#!/usr/bin/env bash
#
# register-adapter.sh — register @casaconomy/adapter-oz-local in Paperclip's plugin store.
#
# Writes to ~/.paperclip/adapter-plugins.json so the server discovers the
# adapter on next startup. Idempotent — safe to re-run.
#
# Run from an npm-installed copy:
#   node_modules/.bin/register-adapter
# Or from the repo root:
#   bash scripts/register-adapter.sh

set -euo pipefail

ADAPTER_TYPE="oz_local"
PACKAGE_NAME="@casaconomy/adapter-oz-local"
ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE_PATH="$HOME/.paperclip/adapter-plugins.json"

say() { printf '  %s\n' "$*"; }
ok()  { printf '✓ %s\n' "$*"; }

if [ ! -f "$ADAPTER_DIR/dist/index.js" ]; then
  say "Building adapter..."
  (cd "$ADAPTER_DIR" && npm run build)
fi

if [ -f "$STORE_PATH" ]; then
  STORE=$(cat "$STORE_PATH")
else
  mkdir -p "$(dirname "$STORE_PATH")"
  STORE="[]"
fi

NEW_STORE=$(python3 <<PY
import json, sys

store = json.loads('''$STORE''')
entry = {
    "type": "$ADAPTER_TYPE",
    "packageName": "$PACKAGE_NAME",
    "localPath": "$ADAPTER_DIR"
}

idx = next((i for i, r in enumerate(store) if r.get("type") == "$ADAPTER_TYPE"), -1)
if idx >= 0:
    store[idx] = entry
else:
    store.append(entry)

print(json.dumps(store, indent=2))
PY
)

echo "$NEW_STORE" > "$STORE_PATH"
ok "Registered $ADAPTER_TYPE in $STORE_PATH"
ok "localPath: $ADAPTER_DIR"
say ""
say "Restart Paperclip server to pick up the new adapter:"
say "  npx paperclipai run"
