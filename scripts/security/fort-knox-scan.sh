#!/bin/bash
echo "========================================"
echo "FORT KNOX SECURITY SCAN — $(date '+%b %d %Y · %H:%M CT')"
echo "========================================"

echo ""
echo "════ A · CREDENTIALS & SECRETS ════"

echo "--- hardcoded API key VALUES (not env var references) ---"
found=$(grep -rn \
  "ghp_[A-Za-z0-9]\{36\}\|sk-ant-api[A-Za-z0-9-]*\|eyJhbGciOiJIUzI1NiJ9\." \
  ~/faraudit-app/src/ ~/bullrize/src/ ~/lexanchor/src/ ~/faraudit-cron/*.js \
  2>/dev/null | grep -v node_modules | grep -v "\.test\.")
[ -n "$found" ] && echo "⚠️  REAL SECRET FOUND: $found" || echo "✓ no hardcoded secret values"

echo ""
echo "--- service role key in CLIENT-side code (components only) ---"
found=$(grep -rn "service_role\|SERVICE_ROLE" \
  ~/faraudit-app/src/components/ \
  2>/dev/null | grep -v node_modules)
[ -n "$found" ] && echo "⚠️  service role in client code: $found" || echo "✓ service role not in client code"

echo ""
echo "--- .env files ever committed to git ---"
for repo in faraudit-app bullrize lexanchor; do
  count=$(git -C ~/$repo log --all --full-history -- ".env" ".env.local" ".env.production" 2>/dev/null | grep -c "^commit")
  [ "$count" -gt 0 ] && echo "⚠️  $repo: .env in git history ($count commits)" || echo "✓ $repo: .env never committed"
done

echo ""
echo "--- .env in .gitignore all 3 repos ---"
for repo in faraudit-app bullrize lexanchor; do
  grep -q "\.env" ~/$repo/.gitignore 2>/dev/null && echo "✓ $repo" || echo "⚠️  $repo: MISSING .env in .gitignore"
done

echo ""
echo "--- git remotes — no embedded credentials ---"
for repo in faraudit-app bullrize lexanchor faraudit-cron; do
  url=$(git -C ~/$repo remote get-url origin 2>/dev/null)
  echo "$url" | grep -q "ghp_\|:[^@]*@github" && echo "⚠️  $repo: credential in URL" || echo "✓ $repo: ${url#https://}"
done

echo ""
echo "--- credential helper ---"
helper=$(git config --global credential.helper)
[ "$helper" = "osxkeychain" ] && echo "✓ osxkeychain" || echo "⚠️  helper: $helper"

echo ""
echo "--- .git-credentials file ---"
[ -f ~/.git-credentials ] && echo "⚠️  WARNING — ~/.git-credentials exists — delete it" || echo "✓ no .git-credentials"

echo ""
echo "════ B · PUBLIC FOLDER SECURITY ════"

echo "--- faraudit-app/public ---"
unexpected=$(ls ~/faraudit-app/public/ | grep -vE "^landing\.html$|^access\.html$|^signin\.html$|^home\.html$|^lifecycle$|\.svg$|\.png$|\.ico$|\.txt$|\.xml$|\.webmanifest$|^\.DS_Store$")
[ -n "$unexpected" ] && echo "⚠️  UNEXPECTED: $unexpected" || echo "✓ clean"

# public/backups/ deploy-path guard (added 2026-05-12)
# Backups must live in ~/faraudit-app/ceo/backups/ (gitignored), not public/ (Vercel-served)
if [ -d ~/faraudit-app/public/backups ]; then
  echo "❌ FAIL: public/backups/ exists — move to ~/faraudit-app/ceo/backups/"
  FORT_KNOX_FAILED=1
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
    || echo "⚠️  /$path → $code (EXPOSED)"
done

echo ""
echo "--- home.html auth wall ---"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://www.faraudit.com/home.html)
[[ "$code" == "307" || "$code" == "302" ]] && echo "✓ /home.html → $code (auth active)" || echo "⚠️  /home.html → $code"

echo ""
echo "--- landing page live ---"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://www.faraudit.com/landing.html)
[ "$code" = "200" ] && echo "✓ /landing.html → 200" || echo "⚠️  /landing.html → $code"

echo ""
echo "════ C · GIT HISTORY & FILE SYSTEM ════"

for repo in faraudit-app bullrize lexanchor; do
  ds=$(git -C ~/$repo ls-files 2>/dev/null | grep -c ".DS_Store")
  [ "$ds" -gt 0 ] && echo "⚠️  $repo: .DS_Store committed ($ds)" || echo "✓ $repo: no .DS_Store"
  grep -q "^ceo/" ~/$repo/.gitignore && echo "✓ $repo: ceo/ gitignored" || echo "⚠️  $repo: ceo/ NOT gitignored"
done

echo ""
echo "════ D · TYPECHECK ════"

for repo in faraudit-app bullrize lexanchor; do
  cd ~/$repo && node_modules/.bin/tsc --noEmit 2>/dev/null && echo "✓ $repo: tsc clean" || echo "⚠️  $repo: tsc errors"
done

echo ""
echo "════ E · ENV VARS ════"

for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY ANTHROPIC_API_KEY SAM_API_KEY; do
  grep -q "^$key=" ~/faraudit-app/.env.local 2>/dev/null && echo "✓ $key" || echo "⚠️  MISSING: $key"
done

echo ""
echo "════ F · STALE REFERENCES ════"

found=$(grep -rn "ceo-digest\|vertex-hub\|apex-hub" \
  ~/faraudit-app/src/ ~/bullrize/src/ ~/lexanchor/src/ \
  2>/dev/null | grep -v node_modules)
[ -n "$found" ] && echo "⚠️  stale CEO refs: $found" || echo "✓ no stale CEO refs"

found=$(grep -rn "Capital OS" ~/faraudit-cron/*.js 2>/dev/null)
[ -n "$found" ] && echo "⚠️  Capital OS still in cron" || echo "✓ Bullrize rebrand complete"

echo ""
echo "════ G · GIT STATUS ════"

for repo in faraudit-app bullrize lexanchor faraudit-cron; do
  status=$(git -C ~/$repo status --short 2>/dev/null)
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
echo "FORT KNOX SCAN COMPLETE"
echo "========================================"
