#!/usr/bin/env python3
"""UserPromptSubmit hook — when the CEO's prompt touches Brain/Chat relay ("prompt?", "sent to chat",
"send to brain", "relay", "card"), inject a standing reminder: ANYTHING outbound to Brain is a CARD on
the board FIRST, written proactively in the same turn — never loose terminal text the CEO has to ask for.
CEO frustration 2026-06-26: "why do I keep reminding you about prompts." Fail-safe: errors → emit nothing."""
import sys, json, re

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

prompt = (data.get("prompt") or data.get("user_prompt") or "")
if not re.search(r"\b(prompt|relay|send (to )?(chat|brain)|sent to chat|to chat|brain card|the card|cards?)\b", prompt, re.I):
    sys.exit(0)

reminder = (
    "⚑ RELAY RULE (CEO standing — stop making me ask): ANY Brain/Chat-bound content — a status update, "
    "question, result, or prompt — must ALREADY be a numbered card in "
    "ceo/redesign-final/Communication/'Send to Chat'/ with the board rebuilt, written PROACTIVELY this turn. "
    "Do NOT put Brain-bound content in the terminal reply and wait to be asked; do NOT say 'want me to card it?' "
    "— just card it, then point the CEO at card #N. On the CEO's 'sent', archive it."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": reminder}}))
sys.exit(0)
