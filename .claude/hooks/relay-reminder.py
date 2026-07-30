#!/usr/bin/env python3
"""UserPromptSubmit hook — when the CEO's prompt touches Brain/Chat relay ("prompt?", "sent to chat",
"send to brain", "relay", "card"), inject the standing reminder: Brain-bound work is a CARD on the board
FIRST, written proactively in the same turn — never loose terminal text the CEO has to ask for.
CEO frustration 2026-06-26: "why do I keep reminding you about prompts."

NARROWED 2026-07-28 (CEO approved in-terminal). The trigger was "ANY Brain/Chat-bound content — a status
update, question, result, or prompt," which carded ~35 items/day and turned the board from a tracking list
into a firehose. It now fires ONLY on the four things Rule 56 actually assigns the Brain: strategy,
positioning, research, content authorship. Status updates, results, and questions directed AT the CEO are
his — they stay in the terminal where he is working. Disambiguation moved to inline markers (🟡 his /
🧠 Brain's + card #), because removing one side from the reply never labelled it, it only deleted it.
Fail-safe: errors → emit nothing."""
import sys, json, re

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

prompt = (data.get("prompt") or data.get("user_prompt") or "")
if not re.search(r"\b(prompt|relay|send (to )?(chat|brain)|sent to chat|to chat|brain card|the card|cards?)\b", prompt, re.I):
    sys.exit(0)

reminder = (
    "⚑ RELAY RULE (CEO standing, NARROWED 2026-07-28 — stop making me ask): Brain-bound work is "
    "STRATEGY · POSITIONING · RESEARCH · CONTENT AUTHORSHIP. Those four must ALREADY be a numbered card in "
    "ceo/redesign-final/Communication/'Send to Chat'/ with the board rebuilt, written PROACTIVELY this turn. "
    "Do NOT put them in the terminal reply and wait to be asked; do NOT say 'want me to card it?' — just card "
    "it, then point the CEO at card #N. On the CEO's 'sent', archive it.\n"
    "DO NOT CARD: status updates, results, findings, and questions directed AT the CEO. Those are HIS and stay "
    "in the terminal reply. Carding them is what turned the board into a firehose.\n"
    "MARK BOTH SIDES INLINE so he can tell whose is whose without opening anything: 🟡 = his decision/click, "
    "🧠 = Brain-bound + the card number."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": reminder}}))
sys.exit(0)
