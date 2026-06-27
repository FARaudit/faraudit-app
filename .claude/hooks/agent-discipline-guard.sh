#!/usr/bin/env bash
# Per-agent SubagentStop discipline reminder (Brain card 82, GAP 4). Referenced ONLY from the frontmatter
# `hooks` of adversarial-redteam + contracts-attorney (agent-scoped, not global). Non-blocking, exit 0:
# emits a final-output discipline checklist as additionalContext so the agent self-checks before finalizing.
# Lightweight by design (Code's discretion per card 82 — heavier validation can be added later if needed).
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SubagentStop","additionalContext":"DISCIPLINE CHECK before finalizing: (1) every FAR/DFARS clause you cite must be VERBATIM in the source (zero fabrication — protest standard); (2) default-to-refute / ground every claim in a real excerpt; (3) flag what you could NOT verify rather than asserting it. If any item fails, fix it before you stop."}}
JSON
exit 0
