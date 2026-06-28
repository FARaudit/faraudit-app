---
name: save
description: Checkpoint everything — run the save protocol (Fort Knox · site health · git · digest/board/tab-tracker sync) so state is durable before /clear or end of phase.
disable-model-invocation: true
---
Run the full save/checkpoint, in this order, from `~/faraudit-app`:
1. `bash ceo/protocol.sh save` (Fort Knox · health · git · digest→inline→board sync). If it errors, fall back to: `node ceo/validate-digest.mjs` → `python3 ceo/build-board.py` → `bash ceo/update-digest.sh`.
2. Append a one-line completion to `digest-data.json` completionsLog summarizing what shipped this phase (material events + FA-item status + the single next action), then re-sync.
3. Report: git head, board item count, and the ONE next action — so a fresh context (post /clear) resumes clean.
Do NOT run any audit. Keep output tight (CEO communication style: 1-line summary + the next action).
