#!/bin/bash
# Railway cron health check — posts status to Telegram CEO digest alert.
# Invoke from a cron agent's post-run hook:
#   bash ~/faraudit-app/scripts/railway-health-check.sh <agent> <success|failure> [message]
AGENT=$1
STATUS=$2
MESSAGE=$3

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "[health-check] Telegram not configured — skipping"
  exit 0
fi

EMOJI="✅"
[ "$STATUS" = "failure" ] && EMOJI="🚨"

TEXT="${EMOJI} *${AGENT}* cron ${STATUS}$([ -n "$MESSAGE" ] && echo ": ${MESSAGE}")"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d parse_mode="Markdown" \
  -d text="${TEXT}" \
  > /dev/null

echo "[health-check] Telegram alert sent: $AGENT $STATUS"
