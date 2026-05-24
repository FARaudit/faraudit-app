#!/usr/bin/env bash
# refresh-fleet.sh — auto-sync d.agents.fleet[] from Railway + Supabase
# Usage: bash scripts/refresh-fleet.sh [--dry]
# Rule 32 compliant: no secret values echo to stdout
# bash 3.2 compatible

set -eo pipefail   # NOT -u (would trip on unbound vars in functions)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JSON="$REPO_ROOT/ceo/digest-data.json"
SYNC="$REPO_ROOT/ceo/update-digest.sh"
DRY=${1:-}

# ── Load env via eval (bash 3.2 quirk: source <(...) drops vars) ──
eval "$(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" "$REPO_ROOT/.env.local" | sed 's/^NEXT_PUBLIC_//')"
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "[refresh-fleet] FAIL: SUPABASE env not loaded" >&2; exit 2
fi

echo "[refresh-fleet] starting · dry=$DRY"

# ── Fetch Railway tree ONCE ──────────────────────────────────────
echo "[refresh-fleet] fetching railway status tree ..."
RAILWAY_TREE=$(railway status --json 2>/dev/null)
if [ -z "$RAILWAY_TREE" ]; then
  echo "[refresh-fleet] FAIL: railway status returned empty" >&2; exit 2
fi
echo "[refresh-fleet] railway tree fetched · $(echo "$RAILWAY_TREE" | jq '.environments.edges[0].node.serviceInstances.edges | length') services"

# ── Config parallel arrays ──
AGENT_IDS=("audit-ai" "email-ai-v3" "sam-ingest" "qa-ai" "recompete-ai" "regulatory-ai" "bullrize-cron" "bullrize-daily-pipeline" "apex-intel-pipeline")
RAILWAY_IDS=("31abdf00-9370-4046-a22e-a9bf470ac9f3" "a33b172d-7420-4180-b94a-3d9c84218ac5" "a52f7252-fc07-42bb-b159-b2396cc7e4ad" "74349805-0c4e-444e-9257-c45373cf1e01" "4aef3e32-ce00-456b-9dd2-d00b1e865457" "a8580a2f-3332-416b-8c5c-98de2db1395f" "2bd4699a-fcaa-4d0a-8e6a-c9ea9e0b6636" "3980f62c-0941-46a6-8aff-d3b99a166b43" "cd691806-f5e5-4aca-8514-29d7828d85ef")
SUPA_TABLES=("audits" "email_ai_runs" "pending_audits" "" "" "" "" "" "")
SUPA_COLS=("created_at" "tick_ended_at" "created_at" "" "" "" "" "" "")

# ── Helpers ──
time_ago() {
  local ts="$1"
  if [ -z "$ts" ] || [ "$ts" = "null" ]; then echo "unknown"; return; fi
  local epoch_now epoch_ts diff
  epoch_now=$(date +%s)
  epoch_ts=$(date -d "$ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${ts%.*}" +%s 2>/dev/null || echo 0)
  diff=$(( epoch_now - epoch_ts ))
  if   [ "$diff" -lt 120 ];   then echo "just now"
  elif [ "$diff" -lt 3600 ];  then echo "$(( diff/60 )) min ago"
  elif [ "$diff" -lt 86400 ]; then echo "$(( diff/3600 )) hours ago"
  else                             echo "$(( diff/86400 )) days ago"
  fi
}

railway_status_for() {
  local svc_id="$1"
  echo "$RAILWAY_TREE" | jq -r --arg sid "$svc_id" \
    '.environments.edges[0].node.serviceInstances.edges[] | select(.node.serviceId == $sid) | .node.latestDeployment.status // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN"
}

supabase_last_tick() {
  local table="$1" col="$2"
  curl -s "${SUPABASE_URL}/rest/v1/${table}?select=${col}&order=${col}.desc&limit=1" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | jq -r ".[0].${col} // \"null\"" 2>/dev/null || echo "null"
}

UPDATES=()
for i in "${!AGENT_IDS[@]}"; do
  agent_id="${AGENT_IDS[$i]}"
  svc_id="${RAILWAY_IDS[$i]}"
  supa_table="${SUPA_TABLES[$i]}"
  supa_col="${SUPA_COLS[$i]}"

  raw_status=$(railway_status_for "$svc_id")
  case "$raw_status" in
    SUCCESS|ACTIVE|DEPLOYING|BUILDING) status="green" ;;
    CRASHED|FAILED|REMOVED)            status="red"   ;;
    *)                                 status="amber" ;;
  esac

  last_tick="null"
  last_tick_display="unknown"
  if [ -n "$supa_table" ]; then
    last_tick=$(supabase_last_tick "$supa_table" "$supa_col")
    last_tick_display=$(time_ago "$last_tick")
  fi

  UPDATES+=("{\"id\":\"$agent_id\",\"status_color\":\"$status\",\"raw_status\":\"$raw_status\",\"last_tick\":\"$last_tick\",\"last_tick_display\":\"$last_tick_display\"}")
  printf "  %-26s railway=%s → %s · last_tick=%s\n" "$agent_id" "$raw_status" "$status" "$last_tick_display"
done

echo ""
echo "[refresh-fleet] updates collected: ${#UPDATES[@]} agents"

if [ "$DRY" = "--dry" ]; then
  echo "[refresh-fleet] DRY RUN — no writes"
  for u in "${UPDATES[@]}"; do echo "  $u"; done
  exit 0
fi

python3 - "$JSON" << PYEOF
import json, sys
path = sys.argv[1]
with open(path) as f:
    d = json.load(f)

updates = [
$(for u in "${UPDATES[@]}"; do echo "    $u,"; done)
]

update_map = {u['id']: u for u in updates}

for agent in d['agents']['fleet']:
    aid = agent.get('id','')
    if aid in update_map:
        u = update_map[aid]
        agent['status_color']      = u['status_color']
        agent['status']            = u['raw_status']
        agent['last_tick']         = u['last_tick']
        agent['last_tick_display'] = u['last_tick_display']

# Update meta.fleet_last_verified — refreshes the Railway-verified stamp
# (consumed by data-digest-key="fleet-verified" in panel-infrastructure + sidebar)
import datetime
d.setdefault('meta', {})['fleet_last_verified'] = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%MZ")

with open(path, 'w') as f:
    json.dump(d, f, indent=2)
print(f"[refresh-fleet] wrote {len(updates)} agent updates · fleet_last_verified bumped")
PYEOF

bash "$SYNC"
echo "[refresh-fleet] done"
