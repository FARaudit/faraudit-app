#!/usr/bin/env bash
# close-p0.sh — digest hygiene helper (FA-42 + FA-43)
# - Refreshes meta.last_updated to current UTC ISO-Z timestamp
# - Recomputes meta.completions_total from len(completionsLog)
# - Invokes update-digest.sh to sync inline JSON in ceo-digest-canonical.html
#
# Usage: bash ~/faraudit-app/scripts/close-p0.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JSON="$REPO_ROOT/ceo/digest-data.json"
SYNC="$REPO_ROOT/ceo/update-digest.sh"

[ -f "$JSON" ] || { echo "FAIL: $JSON missing"; exit 2; }
[ -x "$SYNC" ] || { echo "FAIL: $SYNC not executable"; exit 2; }

python3 - "$JSON" <<'PY'
import json, sys
from datetime import datetime, timezone

path = sys.argv[1]
d = json.load(open(path))

meta = d.setdefault("meta", {})
prev_ts = meta.get("last_updated", "<unset>")
prev_total = meta.get("completions_total", "<unset>")

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
total = len(d.get("completionsLog", []))

meta["last_updated"] = now
meta["completions_total"] = total

json.dump(d, open(path, "w"), indent=2)
print(f"OK: meta.last_updated   {prev_ts} -> {now}")
print(f"OK: meta.completions_total {prev_total} -> {total}")
PY

cd "$REPO_ROOT"
bash "$SYNC"
echo "OK: close-p0.sh complete"
