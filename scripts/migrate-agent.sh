#!/usr/bin/env bash
#
# migrate-agent.sh — switch an agent between claude_local and oz_local adapters.
#
# Reversible: pass --to oz_local to migrate, --to claude_local to revert.
#
# Usage:
#   bash scripts/migrate-agent.sh \
#     --agent <agent-name-or-id> \
#     --to <oz_local|claude_local> \
#     [--model <model-id>]
#
# Examples:
#   bash scripts/migrate-agent.sh --agent Ravens --to oz_local --model claude-4-5-haiku
#   bash scripts/migrate-agent.sh --agent Ravens --to claude_local --model claude-haiku-4-6

set -euo pipefail

: "${PAPERCLIP_URL:=http://127.0.0.1:3100}"
: "${CASACONOMY_COMPANY_ID:=3336b0c9-e25f-47e8-bb7b-9a87107475df}"

say() { printf '  %s\n' "$*"; }
ok()  { printf '✓ %s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

AGENT_QUERY=""
TARGET_ADAPTER=""
MODEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT_QUERY="$2"; shift 2 ;;
    --to)    TARGET_ADAPTER="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    *)       die "Unknown arg: $1" ;;
  esac
done

[ -z "$AGENT_QUERY" ] && die "Missing --agent <name-or-id>"
[ -z "$TARGET_ADAPTER" ] && die "Missing --to <oz_local|claude_local>"

case "$TARGET_ADAPTER" in
  oz_local|claude_local) ;;
  *) die "Invalid adapter type: $TARGET_ADAPTER (expected oz_local or claude_local)" ;;
esac

if ! curl -fs --max-time 3 "$PAPERCLIP_URL/api/companies" >/dev/null 2>&1; then
  die "Paperclip not reachable at $PAPERCLIP_URL"
fi

agents_json="$(curl -fsS "$PAPERCLIP_URL/api/companies/$CASACONOMY_COMPANY_ID/agents")"

AGENT_ID="$(printf '%s' "$agents_json" | python3 -c "
import json, sys
query = sys.argv[1].strip().lower()
d = json.load(sys.stdin)
rows = d if isinstance(d, list) else d.get('data', [])
for r in rows:
    name = (r.get('name') or '').strip().lower()
    aid = (r.get('id') or '').strip().lower()
    if name == query or aid == query:
        print(r['id']); break
" "$AGENT_QUERY")"
[ -z "$AGENT_ID" ] && die "Agent not found: $AGENT_QUERY"

AGENT_NAME="$(printf '%s' "$agents_json" | python3 -c "
import json, sys
aid = sys.argv[1]
d = json.load(sys.stdin)
rows = d if isinstance(d, list) else d.get('data', [])
for r in rows:
    if r.get('id') == aid:
        print(r.get('name', '?')); break
" "$AGENT_ID")"

CURRENT_ADAPTER="$(printf '%s' "$agents_json" | python3 -c "
import json, sys
aid = sys.argv[1]
d = json.load(sys.stdin)
rows = d if isinstance(d, list) else d.get('data', [])
for r in rows:
    if r.get('id') == aid:
        print(r.get('adapterType', 'claude_local')); break
" "$AGENT_ID")"

say "Agent: $AGENT_NAME ($AGENT_ID)"
say "Current adapter: $CURRENT_ADAPTER"
say "Target adapter: $TARGET_ADAPTER"
[ -n "$MODEL" ] && say "Target model: $MODEL"

if [ "$CURRENT_ADAPTER" = "$TARGET_ADAPTER" ]; then
  ok "Already on $TARGET_ADAPTER — nothing to do."
  exit 0
fi

PATCH_PAYLOAD="$(python3 <<PY
import json
patch = {"adapterType": "$TARGET_ADAPTER"}
model = "$MODEL".strip()
if model:
    patch["adapterConfig"] = {"model": model}
print(json.dumps(patch))
PY
)"

say "Patching agent..."
RESP="$(curl -fsS -X PATCH \
  "$PAPERCLIP_URL/api/agents/$AGENT_ID" \
  -H "Content-Type: application/json" \
  -d "$PATCH_PAYLOAD" 2>&1)" || die "PATCH failed: $RESP"

ok "Migrated $AGENT_NAME to $TARGET_ADAPTER"

say "Resetting session..."
curl -fsS -X POST \
  "$PAPERCLIP_URL/api/agents/$AGENT_ID/runtime-state/reset-session" \
  -H "Content-Type: application/json" \
  -d '{}' >/dev/null 2>&1 || say "Session reset skipped (endpoint may not exist)"

ok "Session reset — next heartbeat will use $TARGET_ADAPTER"
