#!/bin/bash
# One-shot: STEP 3 invariant probe for one audit (5-PDF QA).
# Usage: scripts/audit-ai/invariants-5pdf-qa.sh <full-audit-uuid>
# Fetches the live prod render and prints raw counts for the invariant matrix.
set -u
ID="$1"
HTML=$(curl -s -b /tmp/fa-cookies.txt "https://www.faraudit.com/audit/$ID")
CLEAN=$(echo "$HTML" | perl -0pe 's/<style.*?<\/style>//gs; s/<script.*?<\/script>//gs')

echo "== $ID =="
echo "bytes: $(echo "$HTML" | wc -c | tr -d ' ')"
echo "trap_chip: $(echo "$CLEAN" | grep -oE 'matrix_rollup\.trap_count[^>]*>[^<]*<' | head -1)"
echo "trap_rows(badge): $(echo "$CLEAN" | grep -o 'See §04 trap' | wc -l | tr -d ' ')"
echo "sec04_flag_rows: $(echo "$CLEAN" | grep -o 'class="flag-row' | wc -l | tr -d ' ')"
echo "vn_rows: $(echo "$CLEAN" | grep -o 'class="vn-row' | wc -l | tr -d ' ')"
echo "ck_items: $(echo "$CLEAN" | grep -o 'class="ck-item' | wc -l | tr -d ' ')"
echo "ckTotal: $(echo "$CLEAN" | grep -oE 'id="ckTotal"[^>]*>[^<]*' | head -1)"
echo "recommendation: $(echo "$CLEAN" | grep -oE 'data-field="recommendation"[^>]*>[^<]*' | head -1)"
echo "score: $(echo "$CLEAN" | grep -oE 'data-field="score"[^>]*>[^<]*' | head -1)"
echo "vnote_lines:"
echo "$CLEAN" | grep -oE 'class="vn-row[^>]*>.{0,160}' | head -12
