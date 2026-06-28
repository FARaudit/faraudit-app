#!/bin/bash
# G15a — block edits to secrets files (CEO-approved 2026-06-22). PreToolUse hook.
# Self-guards on the actual file path so it ONLY blocks secret files even if the
# settings `if` filter is unsupported on this CLI version (fail-safe: never blocks
# a normal edit). exit 2 = block.
fp=$(cat | jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$fp" in
  *.env|*.env.*|*/.env|*.pem|*.key|*.p12|*.pfx|*id_rsa*|*/credentials)
    echo "Blocked: '$fp' looks like a secrets file — Code must not edit it. Manage secrets directly in 1Password / Vercel / Railway." >&2
    exit 2 ;;
esac
exit 0
