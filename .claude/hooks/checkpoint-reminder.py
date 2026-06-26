#!/usr/bin/env python3
"""UserPromptSubmit hook — when the CEO says "save and checkpoint" (or "checkpoint"/"save"), inject a
standing reminder that a checkpoint is ALWAYS the FULL protocol, never a light version (CEO rule
2026-06-25: a light checkpoint is a major-risk failure). Fail-safe: any error → emit nothing, never
block a prompt."""
import sys, json, re

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

prompt = (data.get("prompt") or data.get("user_prompt") or "")
# Trigger on an explicit save/checkpoint request — not on incidental mentions.
if not re.search(r"\b(save and checkpoint|checkpoint|save\b.*\bcheckpoint)\b", prompt, re.I):
    sys.exit(0)

reminder = (
    "⚑ FULL CHECKPOINT REQUIRED (CEO standing rule — a light checkpoint is a major-risk failure). "
    "Run `bash ceo/checkpoint.sh` (Fort Knox · website health · tsc · board+digest sync) AND complete the "
    "content checklist it prints: RESUME.md current at top · APPEND a completionsLog entry + update "
    "meta.completions_total/head_commit/session_label/next_session_top3 in digest-data.json (re-run "
    "update-digest.sh after) · save durable memory · archive sent cards · CLAUDE.md if rules changed. "
    "Do NOT do a light/partial version."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": reminder}}))
sys.exit(0)
