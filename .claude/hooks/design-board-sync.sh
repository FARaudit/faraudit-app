#!/usr/bin/env bash
# PostToolUse hook — when a design-prompt card (.md under ceo/design-prompts/)
# is written or edited, rebuild the CEO board so the card surfaces immediately.
# Enforces the rule "design prompts live on the board, never in chat" — the CEO
# relays from board.html, never from a chat paste that scrolls away.
# Reads the hook JSON on stdin; no-op for any other file.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$f" in
  */ceo/design-prompts/*.md)
    cd "${CLAUDE_PROJECT_DIR:-/Users/josearodriguezjr./faraudit-app}" \
      && python3 ceo/build-board.py >/dev/null 2>&1
    ;;
esac
exit 0
