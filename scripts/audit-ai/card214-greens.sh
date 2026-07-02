#!/usr/bin/env bash
# Card 214 per-rung green gate. $0 — no paid calls. Prints PASS/FAIL per gate + a final verdict line.
# Reflects CURRENT process.env flag state (the caller sets flags before invoking).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

FAIL=0
line(){ printf '\n──────── %s ────────\n' "$1"; }

line "FLAG STATE (this process)"
for F in AUDIT_ELIGIBLE_TRISTATE AUDIT_SETASIDE_OVERTYPE_GUARD AUDIT_PROCEDURAL_COVERAGE_LENS AUDIT_PROCUREMENT_TYPE_SECTIONS AUDIT_SETASIDE_FIRMSTATUS_GATE AUDIT_SECTION_M_DEPTH; do
  printf '  %s=%s\n' "$F" "${!F:-<unset>}"
done

line "1) tsc --noEmit"
if npx tsc --noEmit 2>&1 | tail -20; then echo "  tsc: PASS"; else echo "  tsc: FAIL"; FAIL=1; fi

line "2) *.test.ts unit suite (17 files, injected stubs)"
for t in $(find src -name "*.test.ts" | sort); do
  OUT=$(npx tsx "$t" 2>&1)
  if echo "$OUT" | grep -q "❌"; then
    echo "  FAIL $t"; echo "$OUT" | grep "❌" | head -5; FAIL=1
  else
    echo "  ok   $t"
  fi
done

line "3) flag-gate scripts (deterministic, \$0)"
for g in test-eligible-tristate test-procedural-coverage test-procedural-truncation test-keyfact-detector test-procurement-sections test-combined-synopsis-emit test-replay-harness test-precondition-overtype-floor test-flag-stack-interaction; do
  P="scripts/audit-ai/$g.ts"
  [ -f "$P" ] || { echo "  MISSING $g"; continue; }
  OUT=$(npx tsx "$P" 2>&1)
  if echo "$OUT" | grep -qE "❌|FAIL"; then
    echo "  FAIL $g"; echo "$OUT" | grep -E "❌|FAIL" | head -5; FAIL=1
  else
    echo "  ok   $g"
  fi
done

line "4) verify:gold-integrity"
if npx tsx scripts/audit-ai/verify-gold-integrity.ts 2>&1 | tail -8; then echo "  gold-integrity: exit0"; else echo "  gold-integrity: FAIL"; FAIL=1; fi

line "RESULT"
if [ "$FAIL" -eq 0 ]; then echo "ALL GREEN"; else echo "RED — STOP"; fi
exit $FAIL
