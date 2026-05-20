#!/usr/bin/env bash
# ~/faraudit-app/scripts/audit-ai/tick-verify.sh
# Run tomorrow ANY TIME after 11:35 UTC (06:35 CDT) to verify the 11:30 UTC tick

cd ~/faraudit-app
set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" .env.local | sed 's/^NEXT_PUBLIC_//') && set +a

TICK_DATE="${1:-2026-05-17}"     # override: ./tick-verify.sh 2026-05-18
TICK_START="${TICK_DATE}T11:25:00Z"
TICK_END="${TICK_DATE}T11:45:00Z"

H=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "── 1. audits.complete count (before: 334, expect: > 334) ──"
COMPLETE=$(curl -s "${H[@]}" "${SUPABASE_URL}/rest/v1/audits?status=eq.complete&select=id" \
  -H "Prefer: count=exact" -I 2>&1 | grep -i content-range | sed 's/.*\///' | tr -d '\r\n ')
echo "    audits.complete = ${COMPLETE}"

echo ""
echo "── 2. New audits inside tick window ${TICK_START} → ${TICK_END} ──"
WINDOW=$(curl -s "${H[@]}" \
  "${SUPABASE_URL}/rest/v1/audits?created_at=gte.${TICK_START}&created_at=lte.${TICK_END}&select=id,status,created_at&order=created_at.asc")
echo "${WINDOW}" | python3 -c "
import json, sys
rows = json.loads(sys.stdin.read() or '[]')
print(f'    rows in window: {len(rows)}')
if rows:
    print(f'    first: {rows[0][\"created_at\"]} status={rows[0][\"status\"]}')
    print(f'    last:  {rows[-1][\"created_at\"]} status={rows[-1][\"status\"]}')
    from collections import Counter
    print(f'    status breakdown: {dict(Counter(r[\"status\"] for r in rows))}')
"

echo ""
echo "── 3. pending_audits status distribution ──"
for s in pending processing processed failed aborted; do
  C=$(curl -s "${H[@]}" "${SUPABASE_URL}/rest/v1/pending_audits?status=eq.${s}&select=id" \
    -H "Prefer: count=exact" -I 2>&1 | grep -i content-range | sed 's/.*\///' | tr -d '\r\n ')
  printf "    %-12s = %s\n" "${s}" "${C}"
done

echo ""
echo "── VERDICT ──"
python3 << PYEOF
import os, urllib.request, json
url = os.environ['SUPABASE_URL']; key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
def q(path):
    r = urllib.request.Request(f"{url}/rest/v1/{path}", headers={"apikey":key,"Authorization":f"Bearer {key}","Prefer":"count=exact"})
    with urllib.request.urlopen(r) as resp:
        return int(resp.headers.get('content-range','0/0').split('/')[-1])

complete = q("audits?status=eq.complete&select=id")
processing = q("pending_audits?status=eq.processing&select=id")
pending = q("pending_audits?status=eq.pending&select=id")
new_in_window = q(f"audits?created_at=gte.${TICK_START}&created_at=lte.${TICK_END}&select=id")

if new_in_window > 0:
    print(f"    GREEN — {new_in_window} new audits in tick window, complete now {complete}")
    print(f"       P0-46 closes. Migration 028 verified end-to-end.")
elif processing > 0:
    print(f"    IN-FLIGHT — {processing} rows stuck in 'processing'. Tick fired but did not finish.")
    print(f"       Investigate audit-engine internals.")
else:
    print(f"    RED — no new audits in tick window, no rows processing.")
    print(f"       Cron did not fire OR fired and failed silently. Need Railway log access.")
    print(f"       Open: P0-46 stays open. Escalate to Railway dashboard.")
PYEOF
