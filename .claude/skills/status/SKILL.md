---
name: status
description: Print the 3-lane control board — 🟡 You (CEO) / 🟢 Code / 🔵 Design — current actionable items + the single next move.
---
Rebuild + read the board, then print the 3 lanes from `~/faraudit-app`:
1. `python3 ceo/build-board.py` (refresh board.html from digest-data.json).
2. Read the active action_items from `ceo/digest-data.json`.
3. Print, tightly: 🟡 YOU (ceo-owned, actionable now) · 🟢 CODE (claude_code-owned) · 🔵 DESIGN (design-prompts/ lane) — top items only, then the single NEXT move. No walls of text.
