#!/usr/bin/env bash
# Rotate ANTHROPIC_API_KEY everywhere it lives, in one pass.
#
# WHY THIS EXISTS. The key lives in 7 places. Doing that by hand is where mistakes happen — a service
# missed, a value pasted into the wrong field, a key echoed into a terminal that keeps history. This
# reads the new key ONCE, writes it everywhere, and verifies by LENGTH ONLY. No value is ever printed,
# logged, written to a temp file, or placed in shell history.
#
# WHAT IT WILL NOT DO. It does not create the key and it does not revoke the old one. Both happen in the
# Anthropic Console, by you. Creating a key is an account action; revoking is irreversible. This script
# only distributes.
#
# ORDER MATTERS, and it is deliberate: distribute the NEW key everywhere and verify, THEN revoke the old
# one in the Console. Revoking first takes production down between the two steps.
#
# RESIDUAL RISK, stated rather than hidden: the Railway and Vercel CLIs take values as arguments, so the
# key is briefly visible in this machine's process list while each command runs. On a single-user laptop
# that is acceptable; on a shared host it is not. The Vercel write goes through the REST API with the body
# on stdin specifically to avoid `vercel env add`, which on CLI 52.x silently consumes piped input as the
# answer to its "Sensitive?" prompt and stores an EMPTY value while reporting success.
#
# Usage:  bash scripts/security/rotate-anthropic-key.sh            # dry run — shows targets, writes nothing
#         bash scripts/security/rotate-anthropic-key.sh --apply    # prompts for the key, then writes

set -euo pipefail
set +x                      # never trace — a traced line would print the key

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

RAILWAY_SERVICES=("audit-worker" "Regulatory-AI" "email-ai-v3" "apex-intel-pipeline")
VERCEL_TARGETS=("production" "preview")
ENV_FILE=".env.local"

say() { printf '%s\n' "$*"; }
hr()  { printf '%s\n' "────────────────────────────────────────────────────────────"; }

# Print only what is safe: presence and length. Never the value.
fingerprint() {   # $1 = a value; prints "len=N" and nothing else
  printf 'len=%s' "${#1}"
}

hr
say "ANTHROPIC_API_KEY rotation"
say "Targets: ${#RAILWAY_SERVICES[@]} Railway services · ${#VERCEL_TARGETS[@]} Vercel environments · $ENV_FILE"
hr
for s in "${RAILWAY_SERVICES[@]}"; do say "  railway  $s"; done
for t in "${VERCEL_TARGETS[@]}"; do say "  vercel   $t"; done
say "  file     $ENV_FILE"
say "  manual   1Password  (update by hand — no CLI assumed)"
hr

if [[ $APPLY -eq 0 ]]; then
  say "DRY RUN — nothing was written."
  say ""
  say "Before you run with --apply:"
  say "  1. Create a NEW key in the Anthropic Console. Do NOT revoke the old one yet."
  say "  2. Have it on the clipboard. This script will prompt; the input is not echoed."
  say ""
  say "Then:  bash scripts/security/rotate-anthropic-key.sh --apply"
  exit 0
fi

# ── Read the key once. -s suppresses echo; it never enters history because this is a script, not a
#    prompt line you typed. Reading from /dev/tty keeps it working even if stdin is redirected.
printf 'Paste the NEW ANTHROPIC_API_KEY (input hidden), then press return: '
IFS= read -rs NEWKEY < /dev/tty
printf '\n'

[[ -n "${NEWKEY:-}" ]] || { say "ERROR: empty input — nothing written."; exit 1; }
case "$NEWKEY" in
  sk-ant-*) : ;;
  *) say "ERROR: that does not look like an Anthropic key (expected an sk-ant- prefix). Nothing written."; exit 1 ;;
esac
say "Read a key: $(fingerprint "$NEWKEY"). Distributing…"
hr

FAILED=0

# ── Railway ────────────────────────────────────────────────────────────────────────────────────────
# Railway injects env at CONTAINER START. Setting a variable does NOT reach the running container, so
# every service is redeployed after the write or the rotation is inert — the service keeps using the
# revoked key until something else happens to restart it.
for s in "${RAILWAY_SERVICES[@]}"; do
  say "railway · $s"
  if railway variables --service "$s" --set "ANTHROPIC_API_KEY=$NEWKEY" >/dev/null 2>&1; then
    say "  set     ok"
  else
    say "  set     FAILED"; FAILED=1; continue
  fi
  if railway redeploy --service "$s" --yes >/dev/null 2>&1; then
    say "  redeploy ok  (env only reaches the container on restart)"
  else
    say "  redeploy FAILED — the new key is stored but NOT live on this service"; FAILED=1
  fi
done
hr

# ── Vercel ─────────────────────────────────────────────────────────────────────────────────────────
# Written through the REST API, body on stdin. `vercel env add` is deliberately avoided (see header).
if [[ -f .vercel/project.json ]]; then
  PROJECT_ID=$(python3 -c 'import json;print(json.load(open(".vercel/project.json"))["projectId"])')
  TEAM_ID=$(python3 -c 'import json;print(json.load(open(".vercel/project.json"))["orgId"])')
  TOKEN="${VERCEL_TOKEN:-}"
  if [[ -z "$TOKEN" ]]; then
    say "vercel · skipped — VERCEL_TOKEN is not set in this shell."
    say "         Export a token from vercel.com/account/tokens and re-run, or set both"
    say "         environments by hand in the dashboard."
    FAILED=1
  else
    for t in "${VERCEL_TARGETS[@]}"; do
      say "vercel · $t"
      # Remove the existing value first — the API rejects a duplicate key/target pair.
      EXISTING=$(curl -sS "https://api.vercel.com/v9/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
        -H "Authorization: Bearer $TOKEN" \
        | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((e['id'] for e in d.get('envs',[]) if e['key']=='ANTHROPIC_API_KEY' and '$t' in e.get('target',[])),''))" 2>/dev/null || echo "")
      if [[ -n "$EXISTING" ]]; then
        curl -sS -X DELETE "https://api.vercel.com/v9/projects/$PROJECT_ID/env/$EXISTING?teamId=$TEAM_ID" \
          -H "Authorization: Bearer $TOKEN" >/dev/null && say "  removed old ok"
      fi
      if python3 -c "
import json,sys
sys.stdout.write(json.dumps({'key':'ANTHROPIC_API_KEY','value':sys.argv[1],'type':'encrypted','target':[sys.argv[2]]}))
" "$NEWKEY" "$t" | curl -sS -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
            -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
            --data-binary @- >/dev/null; then
        say "  set     ok"
      else
        say "  set     FAILED"; FAILED=1
      fi
    done
    say "  NOTE: Vercel snapshots env at BUILD START. The new key reaches production only on a FRESH"
    say "        build — trigger one (\`vercel redeploy\` on the latest deployment) or the rotation is"
    say "        inert on the web app."
  fi
else
  say "vercel · skipped — .vercel/project.json not found."; FAILED=1
fi
hr

# ── .env.local ─────────────────────────────────────────────────────────────────────────────────────
# Rewritten via python so the key never passes through a sed expression (which would land in argv and
# in any shell trace). Permissions are re-asserted afterward.
if [[ -f "$ENV_FILE" ]]; then
  say "file · $ENV_FILE"
  if ANTHROPIC_NEWKEY="$NEWKEY" python3 - "$ENV_FILE" <<'PY'
import os, sys, re
path = sys.argv[1]
key  = os.environ["ANTHROPIC_NEWKEY"]
lines = open(path, encoding="utf-8").read().splitlines(keepends=True)
out, found = [], False
for ln in lines:
    if re.match(r'^\s*ANTHROPIC_API_KEY\s*=', ln):
        out.append(f"ANTHROPIC_API_KEY={key}\n"); found = True
    else:
        out.append(ln)
if not found:
    out.append(f"ANTHROPIC_API_KEY={key}\n")
open(path, "w", encoding="utf-8").write("".join(out))
PY
  then
    chmod 600 "$ENV_FILE"
    say "  set     ok  (mode 600)"
  else
    say "  set     FAILED"; FAILED=1
  fi
else
  say "file · $ENV_FILE not found — skipped."
fi
unset NEWKEY ANTHROPIC_NEWKEY
hr

# ── Verify — presence and LENGTH ONLY. No value crosses into the terminal. ─────────────────────────
say "VERIFY (length only — no value is printed)"
for s in "${RAILWAY_SERVICES[@]}"; do
  L=$(railway variables --service "$s" --kv 2>/dev/null | awk -F= '/^ANTHROPIC_API_KEY=/{print length($2)}' | head -1)
  say "  railway  $s: ${L:-MISSING}"
done
L=$(awk -F= '/^ANTHROPIC_API_KEY=/{print length($2)}' "$ENV_FILE" 2>/dev/null | head -1)
say "  file     $ENV_FILE: ${L:-MISSING}"
say "  vercel   values are write-only via the API — confirm in the dashboard, or by a fresh build succeeding."
hr

if [[ $FAILED -eq 0 ]]; then
  say "All targets written. NOW, in order:"
else
  say "SOME TARGETS FAILED (see above). Fix them BEFORE the next step."
fi
say "  1. Trigger a fresh Vercel build so the web app picks up the new key."
say "  2. Confirm one real call succeeds on each surface (an audit run, a cron tick)."
say "  3. ONLY THEN revoke the OLD key in the Anthropic Console."
say "  4. Update 1Password by hand."
say ""
say "Step 3 is last on purpose. Revoking before the new key is proven live takes production down."
exit $FAILED
