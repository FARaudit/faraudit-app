#!/usr/bin/env bash
# Gauntlet Bench Protocol B4a — DETERMINISTIC probe replay. SCRIPT execution only, ZERO model tokens.
# The red-team subagent READS this harness's consolidated report; it never re-runs the probes itself.
#
# Usage:  bash scripts/audit-ai/_gauntlet-replay.sh [--suites 'src/lib/glob*.test.ts'] [--reprove path.ts] [PROBE.ts ...]
# Default: all src/lib/*.test.ts suites (pass/fail) + any probes passed as trailing args (diagnostic dump).
# Exit:    non-zero if ANY suite fails. Consolidated report → /tmp/gauntlet-replay-report.txt (path echoed).
set -u
cd "$(dirname "$0")/../.." || exit 3

SUITE_GLOB='src/lib/*.test.ts'
REPROVE=''
PROBES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --suites) SUITE_GLOB="$2"; shift 2 ;;
    --reprove) REPROVE="$2"; shift 2 ;;
    *) PROBES+=("$1"); shift ;;
  esac
done

REPORT=/tmp/gauntlet-replay-report.txt
: > "$REPORT"
pass=0; fail=0; failed_list=""

echo "=== GAUNTLET REPLAY (B4a · script-only, no model) ===" | tee -a "$REPORT"

echo "" | tee -a "$REPORT"
echo "--- SUITES ($SUITE_GLOB) ---" | tee -a "$REPORT"
for f in $SUITE_GLOB; do
  [ -e "$f" ] || continue
  if npx tsx "$f" >/dev/null 2>&1; then
    pass=$((pass+1)); echo "PASS  $f" | tee -a "$REPORT"
  else
    fail=$((fail+1)); failed_list="$failed_list $f"; echo "FAIL  $f" | tee -a "$REPORT"
  fi
done

if [ -n "$REPROVE" ] && [ -e "$REPROVE" ]; then
  echo "" | tee -a "$REPORT"
  echo "--- REPROVE ($REPROVE) ---" | tee -a "$REPORT"
  if npx tsx "$REPROVE" >>"$REPORT" 2>&1; then
    echo "PASS  reprove" | tee -a "$REPORT"
  else
    fail=$((fail+1)); failed_list="$failed_list $REPROVE"; echo "FAIL  reprove" | tee -a "$REPORT"
  fi
fi

if [ "${#PROBES[@]}" -gt 0 ]; then
  echo "" | tee -a "$REPORT"
  echo "--- DIAGNOSTIC PROBES (dump for the red-team to read; no pass/fail) ---" | tee -a "$REPORT"
  for p in "${PROBES[@]}"; do
    [ -e "$p" ] || { echo "(missing) $p" | tee -a "$REPORT"; continue; }
    echo "" >> "$REPORT"; echo "### $p" >> "$REPORT"
    npx tsx "$p" >>"$REPORT" 2>&1
    echo "  dumped $p" | tee -a "$REPORT"
  done
fi

echo "" | tee -a "$REPORT"
echo "=== SUMMARY: suites PASS=$pass FAIL=$fail ===" | tee -a "$REPORT"
[ -n "$failed_list" ] && echo "FAILED:$failed_list" | tee -a "$REPORT"
echo "report: $REPORT"
[ "$fail" -eq 0 ]
