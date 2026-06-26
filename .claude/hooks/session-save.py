#!/usr/bin/env python3
"""SessionEnd hook — runs RIGHT BEFORE the context is wiped (incl. /clear, reason='clear').

A shell hook cannot capture in-context reasoning (that lives in the model, not a file — only a
checkpoint writes it). What it CAN do at the clear moment is preserve the on-disk breadcrumbs so
an un-checkpointed clear stays fully recoverable:
  - the open Task list already persists on disk (~/.claude/tasks/<id>/*.json),
  - here we stamp WHICH transcript holds the full detail, plus when + why it ended,
so the next SessionStart can point back to it.

Hardened (post-review): native timestamp (no `date` subprocess), ATOMIC write (temp + os.replace
so concurrent clears can't leave a truncated file), whole body guarded — a save hook must NEVER
break session teardown. Always exits 0."""
import json
import os
import sys
from datetime import datetime, timezone

proj = os.environ.get("CLAUDE_PROJECT_DIR", os.path.expanduser("~/faraudit-app"))
d = os.path.join(proj, "ceo", ".continuity")
try:
    os.makedirs(d, exist_ok=True)
    try:
        p = json.load(sys.stdin)
        if not isinstance(p, dict):
            p = {}
    except Exception:
        p = {}
    try:
        ended = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        ended = ""
    rec = {
        "reason": p.get("reason", ""),
        "transcript_path": p.get("transcript_path", ""),
        "session_id": p.get("session_id", ""),
        "cwd": p.get("cwd", ""),
        "ended_at": ended,
    }
    final = os.path.join(d, "last-session.json")
    tmp = final + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(rec, f, indent=2)
    os.replace(tmp, final)  # atomic: a reader never sees a half-written file
except Exception:
    pass  # a save hook must never break the session teardown
sys.exit(0)
