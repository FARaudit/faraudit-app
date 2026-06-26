#!/usr/bin/env bash
# PostToolUse hook — when ANY relay card (.md under a board lane) is written or edited, rebuild the CEO
# board immediately so the card surfaces without the CEO ever reminding Code. Covers all OUTBOUND relay
# lanes (Brain/Chat · Design · Cowork) PLUS the legacy ceo/design-prompts path. ENFORCEMENT, not a reminder:
# the board is the CEO's only source, so a prompt that isn't on the board does not exist (CEO 2026-06-26
# "hook does not work if CEO is always reminding code to update the board"). Reads hook JSON on stdin;
# no-op for any other file. Fail-safe: errors never block the tool.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$f" in
  */ceo/design-prompts/*.md \
  |*"/Communication/Send to Chat/"*.md \
  |*"/Communication/Send to Design/"*.md \
  |*"/Communication/Send to Cowork/"*.md)
    cd "${CLAUDE_PROJECT_DIR:-/Users/josearodriguezjr./faraudit-app}" \
      && python3 ceo/build-board.py >/dev/null 2>&1
    ;;
esac
exit 0
