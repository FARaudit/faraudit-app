#!/bin/bash
echo "========================================"
echo "FORT KNOX SECURITY SCAN — $(date '+%b %d %Y · %H:%M CT')"
echo "========================================"

echo "════ A · CREDENTIALS & SECRETS ════"
grep -rn "ghp_\|sk-ant-\|SUPABASE_SERVICE_ROLE\|password\s*=\s*['\"][^'\"]\|secret\s*=\s*['\"][^'\"]" \
  ~/faraudit-app/src/ ~/bullrize/src/ ~/lexanchor/src/ ~/faraudit-cron/*.js \
  2>/dev/null | grep -v node_modules | grep -v "placeholder\|example\|your-" \
  && echo "WARNING" || echo "✓ no hardcoded secrets"

for repo in faraudit-app bullrize lexanchor faraudit-cron; do
  url=$(git -C ~/$repo remote get-url origin 2>/dev/null)
  echo "$url" | grep -q "@" && echo "⚠️  $repo: embedded credential" || echo "✓ $repo remote clean"
done

[ -f ~/.git-credentials ] && echo "⚠️  WARNING — ~/.git-credentials exists" || echo "✓ no .git-credentials"
grep -rn "service_role\|SERVICE_ROLE" ~/faraudit-app/src/ ~/bullrize/src/ ~/lexanchor/src/ \
  2>/dev/null | grep -v node_modules && echo "⚠️  service role in frontend" || echo "✓ service role clean"

echo "════ B · PUBLIC FOLDERS ════"
for repo in faraudit-app bullrize lexanchor; do
  echo "--- $repo/public ---" && ls ~/$repo/public/
done

for path in ceo-digest.html hub.html org-chart.html vertex-hub-v6.html; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://faraudit.com/$path)
  [[ "$code" == "307" || "$code" == "302" || "$code" == "404" ]] \
    && echo "✓ /$path → $code" || echo "⚠️  /$path → $code EXPOSED"
done

echo "════ C · GIT & FILE SYSTEM ════"
for repo in faraudit-app bullrize lexanchor; do
  git -C ~/$repo ls-files | grep -c ".DS_Store" | grep -v "^0" && echo "⚠️  $repo DS_Store" || echo "✓ $repo no DS_Store"
  grep -q "^ceo/" ~/$repo/.gitignore && echo "✓ $repo ceo/ gitignored" || echo "⚠️  $repo ceo/ NOT gitignored"
done

echo "════ D · TYPESCRIPT ════"
for repo in faraudit-app bullrize lexanchor; do
  cd ~/$repo && node_modules/.bin/tsc --noEmit 2>/dev/null && echo "✓ $repo tsc clean" || echo "⚠️  $repo tsc errors"
done

echo "════ E · ENV VARS ════"
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY ANTHROPIC_API_KEY NEXT_PUBLIC_SAM_API_KEY; do
  grep -q "^$key=" ~/faraudit-app/.env.local 2>/dev/null && echo "✓ $key" || echo "⚠️  MISSING: $key"
done

echo "════ F · STALE REFS ════"
grep -rn "ceo-digest\|vertex-hub\|apex-hub\|Capital OS" \
  ~/faraudit-app/src/ ~/bullrize/src/ ~/lexanchor/src/ ~/faraudit-cron/*.js \
  2>/dev/null | grep -v node_modules && echo "⚠️  stale refs found" || echo "✓ no stale refs"

echo "════ G · GIT STATUS ════"
for repo in faraudit-app bullrize lexanchor faraudit-cron; do
  status=$(git -C ~/$repo status --short 2>/dev/null)
  [ -n "$status" ] && echo "⚠️  $repo: $status" || echo "✓ $repo clean"
done

echo "════ H · MANUAL (check dashboards) ════"
echo "□ GitHub 2FA · □ Vercel deployments · □ Supabase RLS"
echo "□ Anthropic budget · □ 1Password · □ Google 2FA"

echo "======================================== SCAN COMPLETE"
