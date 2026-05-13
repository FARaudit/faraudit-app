#!/usr/bin/env bash
set -euo pipefail

# Sync ~/faraudit-app/ceo/ to Google Drive Claude-Drops folder.
# Called by:
#  - launchd watcher (auto, on file change)
#  - manual: bash ~/faraudit-app/scripts/sync-digest-to-drive.sh

CEO_DIR="$HOME/faraudit-app/ceo"
REMOTE="gdrive:Claude-Drops"
LOG="$HOME/faraudit-app/scripts/sync-digest.log"
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)

# launchd hands us a minimal PATH; rclone lives under /opt/homebrew/bin
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

FILES=(
  "ceo-digest-canonical.html"
  "ceo-digest-light-snapshot_2026-05-07.html"
  "hub.html"
  "org-chart.html"
  "one-pager.html"
  "session-handoff.html"
  "protocols.md"
  "digest-data.json"
)

echo "[$STAMP] sync started" >> "$LOG"

for f in "${FILES[@]}"; do
  if [ -f "$CEO_DIR/$f" ]; then
    rclone copy "$CEO_DIR/$f" "$REMOTE/" --quiet 2>> "$LOG" \
      && echo "[$STAMP] live: $f OK" >> "$LOG" \
      || echo "[$STAMP] live: $f FAILED" >> "$LOG"
  fi
done

# Daily snapshot — canonical + protocols (history preserve)
for f in "ceo-digest-canonical.html" "protocols.md"; do
  if [ -f "$CEO_DIR/$f" ]; then
    base="${f%.*}"
    ext="${f##*.}"
    rclone copyto "$CEO_DIR/$f" \
      "$REMOTE/snapshots/${base}_${STAMP}.${ext}" \
      --quiet 2>> "$LOG" || true
  fi
done

echo "[$STAMP] sync complete" >> "$LOG"
