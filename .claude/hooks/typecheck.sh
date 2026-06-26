#!/bin/bash
# G14 — type-check on save (CEO-approved 2026-06-22). PostToolUse hook: after Code
# edits a .ts file, run the project type-checker and surface any errors back to
# Code (exit 0 + additionalContext = inform, never blocks the edit). Catches the
# class of bug that once failed a prod deploy (a type error in scripts/).
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
out=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  msg=$(printf '%s' "$out" | head -25)
  jq -nc --arg m "tsc found TYPE ERRORS after this edit — fix before continuing:
$msg" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}'
fi
exit 0
