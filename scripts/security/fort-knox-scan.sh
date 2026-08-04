#!/bin/bash
# FORT KNOX — the LOCAL/OPERATIONAL security pass.
#
# 2026-08-03: this script could not fail. It contained no `exit` statement, and its single failure flag
# (FORT_KNOX_FAILED, set once for public/backups) was never read. Proven by planted positive: a real
# ghp_-shaped token dropped into src/ was DETECTED, PRINTED, and the script still exited 0. Every
# ⚠️ it has ever emitted was advisory, including the ones that say "REAL SECRET FOUND".
#
# Two changes, and no new checks:
#   1. FAIL() records a finding and the script now EXITS 1 when any fired. A gate that cannot go red is
#      not a gate, and wiring this into CI while it always exited 0 would have manufactured a green check.
#   2. SKIP() — an ABSENT input is reported by name, never as a pass. Every sibling-repo check globbed
#      ~/bullrize, ~/lexanchor, ~/faraudit-cron with 2>/dev/null; a missing directory yields empty output
#      and took the "✓" branch, so in CI, in a git worktree, or on any other machine, "repo not here" and
#      "repo is clean" printed identically.
#
# The DETERMINISTIC invariants (Rules 32, 60, 17) now live in src/lib/security-invariants.ts and run in CI
# via self-audit, where they belong. This script keeps what genuinely needs a workstation: live URLs, the
# local keychain, sibling checkouts, the .env.local inventory.
FORT_KNOX_FAILURES=0
FORT_KNOX_SKIPS=0
FAIL() { echo "❌ FAIL: $*"; FORT_KNOX_FAILURES=$((FORT_KNOX_FAILURES + 1)); }
SKIP() { echo "○ SKIP: $* — NOT a pass; this check asserted nothing on this run"; FORT_KNOX_SKIPS=$((FORT_KNOX_SKIPS + 1)); }
# Resolve THIS repository from the script's own location, not from ~. On a CI runner the checkout lives at
# $GITHUB_WORKSPACE, so every hard-coded `~/faraudit-app` check would have found nothing and skipped — turning the CI job
# into ceremony. Sibling repos stay ~-based because they genuinely are separate checkouts.
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
have_repo() { if [ "$1" = "faraudit-app" ]; then [ -d "$APP_ROOT/.git" ]; else [ -d "$HOME/$1/.git" ]; fi; }
repo_path() { if [ "$1" = "faraudit-app" ]; then echo "$APP_ROOT"; else echo "$HOME/$1"; fi; }

echo "========================================"
echo "FORT KNOX SECURITY SCAN — $(date '+%b %d %Y · %H:%M CT')"
echo "========================================"

echo ""
echo "════ A · CREDENTIALS & SECRETS ════"

echo "--- hardcoded API key VALUES (not env var references) ---"
# `sk-ant-api[A-Za-z0-9-]*` ended in `*`, so it matched the BARE PREFIX with zero key characters after it —
# any file merely naming the shape was a "REAL SECRET FOUND". It fired on this repo's own detector module the
# moment one existed. A prefix is not a credential; require key-length characters, matching the {20,} floor in
# src/lib/security-invariants.ts. Tightening it removes a false positive, not a real detection.
found=$(grep -rn \
  "ghp_[A-Za-z0-9]\{36\}\|sk-ant-api[A-Za-z0-9-]\{20,\}\|eyJhbGciOiJIUzI1NiJ9\." \
  $APP_ROOT/src/ ~/bullrize/src/ ~/lexanchor/src/ ~/faraudit-cron/*.js \
  2>/dev/null | grep -v node_modules | grep -v "\.test\.")
# Value never echoed (Rule 32): printing the secret to prove the secret leaked is the same defect.
[ -n "$found" ] && FAIL "hardcoded secret VALUE in tracked source — $(echo "$found" | cut -d: -f1-2 | tr '\n' ' ')" || echo "✓ no hardcoded secret values"

echo ""
echo "--- service role key in CLIENT-side code (components only) ---"
found=$(grep -rn "service_role\|SERVICE_ROLE" \
  $APP_ROOT/src/components/ \
  2>/dev/null | grep -v node_modules)
[ -n "$found" ] && FAIL "service-role reference in client code — $(echo "$found" | cut -d: -f1-2 | tr '\n' ' ')" || echo "✓ service role not in client code"

echo ""
echo "--- .env files ever committed to git ---"
for repo in faraudit-app bullrize lexanchor; do
  have_repo "$repo" || { SKIP "$repo not checked out — .env git-history check"; continue; }
  count=$(git -C "$(repo_path "$repo")" log --all --full-history -- ".env" ".env.local" ".env.production" 2>/dev/null | grep -c "^commit")
  [ "$count" -gt 0 ] && FAIL "$repo: .env in git history ($count commits)" || echo "✓ $repo: .env never committed"
done

echo ""
echo "--- .env in .gitignore all 3 repos ---"
for repo in faraudit-app bullrize lexanchor; do
  have_repo "$repo" || { SKIP "$repo not checked out — .gitignore check"; continue; }
  grep -q "\.env" "$(repo_path "$repo")"/.gitignore 2>/dev/null && echo "✓ $repo" || FAIL "$repo: MISSING .env in .gitignore"
done

echo ""
echo "--- git remotes — no embedded credentials ---"
for repo in faraudit-app bullrize lexanchor faraudit-cron; do
  have_repo "$repo" || { SKIP "$repo not checked out — remote-URL credential check"; continue; }
  url=$(git -C "$(repo_path "$repo")" remote get-url origin 2>/dev/null)
  echo "$url" | grep -q "ghp_\|:[^@]*@github" && FAIL "$repo: credential embedded in remote URL" || echo "✓ $repo: ${url#https://}"
done

echo ""
echo "--- credential helper ---"
helper=$(git config --global credential.helper)
[ "$helper" = "osxkeychain" ] && echo "✓ osxkeychain" || echo "⚠️  helper: $helper"

echo ""
echo "--- .git-credentials file ---"
[ -f ~/.git-credentials ] && FAIL "~/.git-credentials exists on disk — delete it" || echo "✓ no .git-credentials"

echo ""
echo "════ B · PUBLIC FOLDER SECURITY ════"

echo "--- faraudit-app/public ---"
unexpected=$(ls $APP_ROOT/public/ | grep -vE "^landing\.html$|^access\.html$|^signin\.html$|^home\.html$|^lifecycle$|\.svg$|\.png$|\.ico$|\.txt$|\.xml$|\.webmanifest$|^\.DS_Store$")
[ -n "$unexpected" ] && echo "⚠️  UNEXPECTED: $unexpected" || echo "✓ clean"

# public/backups/ deploy-path guard (added 2026-05-12)
# Backups must live in the repo's ceo/backups/ (gitignored), not public/ (Vercel-served)
if [ -d $APP_ROOT/public/backups ]; then
  FAIL "public/backups/ exists — move to $APP_ROOT/ceo/backups/ (public/ is Vercel-served)"
fi

echo "--- bullrize/public ---"
unexpected=$(ls ~/bullrize/public/ | grep -vE "\.svg$|\.png$|\.ico$|^sw\.js$|^lifecycle$|\.txt$|\.webmanifest$|^\.DS_Store$")
[ -n "$unexpected" ] && echo "⚠️  UNEXPECTED: $unexpected" || echo "✓ clean"

echo "--- lexanchor/public ---"
unexpected=$(ls ~/lexanchor/public/ | grep -vE "\.svg$|\.png$|\.ico$|^lifecycle$|\.txt$|\.webmanifest$|^\.DS_Store$")
[ -n "$unexpected" ] && echo "⚠️  UNEXPECTED: $unexpected" || echo "✓ clean"

echo ""
echo "--- live faraudit.com — CEO files must be blocked ---"
for path in ceo-digest.html hub.html org-chart.html vertex-hub-v6.html one-pager.html; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://www.faraudit.com/$path)
  [[ "$code" == "307" || "$code" == "302" || "$code" == "404" ]] \
    && echo "✓ /$path → $code (blocked)" \
    || FAIL "/$path → $code — CEO file EXPOSED"
done

echo ""
echo "--- home.html auth wall ---"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://www.faraudit.com/home.html)
[[ "$code" == "307" || "$code" == "302" ]] && echo "✓ /home.html → $code (auth active)" || FAIL "/home.html → $code — auth wall is NOT active"

echo ""
echo "--- landing page live ---"
# `/` is the landing page — it is served from public/root-landing.html by src/app/page.tsx. This
# checked /landing.html, an orphaned second landing page nothing linked to, so the live check on the
# actual front door did not exist while a page no visitor reached was polled every run.
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://www.faraudit.com/)
[ "$code" = "200" ] && echo "✓ / → 200" || echo "⚠️  / → $code"

echo ""
echo "════ C · GIT HISTORY & FILE SYSTEM ════"

for repo in faraudit-app bullrize lexanchor; do
  have_repo "$repo" || { SKIP "$repo not checked out — .DS_Store / ceo-gitignore checks"; continue; }
  ds=$(git -C "$(repo_path "$repo")" ls-files 2>/dev/null | grep -c ".DS_Store")
  [ "$ds" -gt 0 ] && echo "⚠️  $repo: .DS_Store committed ($ds)" || echo "✓ $repo: no .DS_Store"
  grep -q "^ceo/" "$(repo_path "$repo")"/.gitignore && echo "✓ $repo: ceo/ gitignored" || echo "⚠️  $repo: ceo/ NOT gitignored"
done

echo ""
echo "════ D · TYPECHECK ════"

for repo in faraudit-app bullrize lexanchor; do
  have_repo "$repo" || { SKIP "$repo not checked out — typecheck"; continue; }
  [ -x "$(repo_path "$repo")"/node_modules/.bin/tsc ] || { SKIP "$repo has no installed tsc — typecheck"; continue; }
  ( cd "$(repo_path "$repo")" && node_modules/.bin/tsc --noEmit >/dev/null 2>&1 ) && echo "✓ $repo: tsc clean" || FAIL "$repo: tsc errors"
done

echo ""
echo "════ E · ENV VARS ════"

if [ ! -f $APP_ROOT/.env.local ]; then
  SKIP ".env.local absent (CI / fresh clone) — local env inventory"
else
  for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY ANTHROPIC_API_KEY SAM_API_KEY; do
    grep -q "^$key=" $APP_ROOT/.env.local && echo "✓ $key present" || echo "⚠️  MISSING: $key"
  done
  # A key name containing whitespace is a mangled multi-line paste, not a variable.
  bad=$(grep -cE "^[^=]*[[:space:]][^=]*=" $APP_ROOT/.env.local 2>/dev/null)
  [ "${bad:-0}" -gt 0 ] && FAIL ".env.local has $bad malformed key(s) — a name containing whitespace is a mangled paste" || echo "✓ no malformed keys"
fi

echo ""
echo "════ F · STALE REFERENCES ════"

found=$(grep -rn "ceo-digest\|vertex-hub\|apex-hub" \
  $APP_ROOT/src/ ~/bullrize/src/ ~/lexanchor/src/ \
  2>/dev/null | grep -v node_modules)
[ -n "$found" ] && echo "⚠️  stale CEO refs: $found" || echo "✓ no stale CEO refs"

found=$(grep -rn "Capital OS" ~/faraudit-cron/*.js 2>/dev/null)
[ -n "$found" ] && echo "⚠️  Capital OS still in cron" || echo "✓ Bullrize rebrand complete"

echo ""
echo "════ G · GIT STATUS ════"

for repo in faraudit-app bullrize lexanchor faraudit-cron; do
  have_repo "$repo" || { SKIP "$repo not checked out — git status"; continue; }
  status=$(git -C "$(repo_path "$repo")" status --short 2>/dev/null)
  [ -n "$status" ] && echo "⚠️  $repo uncommitted: $status" || echo "✓ $repo: clean"
done

echo ""
echo "════ H · MANUAL CHECKS (verify in dashboards) ════"
echo "□ GitHub — 2FA active · no unknown tokens"
echo "□ Vercel — no failed deployments"
echo "□ Supabase — RLS enabled on all tables"
echo "□ Anthropic — API usage within budget"
echo "□ 1Password — accessible · GitHub PAT saved"
echo "□ Google Workspace — 2FA on all aliases"

echo ""
echo "========================================"
if [ "$FORT_KNOX_FAILURES" -gt 0 ]; then
  echo "FORT KNOX: ❌ $FORT_KNOX_FAILURES FAILURE(S) · $FORT_KNOX_SKIPS skipped"
  echo "========================================"
  exit 1
fi
echo "FORT KNOX: ✓ PASS · $FORT_KNOX_SKIPS check(s) skipped by name"
[ "$FORT_KNOX_SKIPS" -gt 0 ] && echo "  A skip is not a pass — those checks asserted nothing."
echo "========================================"
exit 0
