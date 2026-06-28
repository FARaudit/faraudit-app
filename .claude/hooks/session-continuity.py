#!/usr/bin/env python3
"""SessionStart continuity hook — re-surface pending state after /clear so nothing is lost.

Fires on every session start (startup / resume / clear / compact). Injects, via
hookSpecificOutput.additionalContext:
  1) ceo/RESUME.md            — the rolling "where we are / next steps" pointer.
  2) the prior session's OPEN tasks, read from ~/.claude/tasks/<session-id>/*.json.
  3) the last-session breadcrumb (transcript pointer) for un-checkpointed-clear recovery.

Task selection is the subtle part (hardened after an adversarial review):
  - Tasks persist on disk keyed by SESSION ID. The CURRENT session's dir is by definition the
    newest, so a naive "most-recent dir" picks our OWN (usually empty) dir and hides the prior
    session's open work. We therefore EXCLUDE the current session's dir (id from stdin).
  - ~/.claude/tasks is GLOBAL per machine, not per project. We PROJECT-SCOPE by only accepting a
    task dir whose <session_id>.jsonl transcript sits in the same dir as THIS session's transcript
    (derived from stdin transcript_path) — so another repo's tasks never leak in.
  - We only stop searching after finding a dir that yields >=1 OPEN row (a newest dir of all-
    completed tasks must not shadow older dirs with real open work).

Invariant: this hook must be IMPOSSIBLE to fail a session with — every path exits 0 and the only
stdout write is one JSON object (size-capped). Stray output / hangs / tracebacks are not allowed."""
import json
import os
import glob
import sys

MAX_RESUME_CHARS = 8000
MAX_TOTAL_CHARS = 16000
MAX_TASK_ROWS = 50

proj = os.environ.get("CLAUDE_PROJECT_DIR", os.path.expanduser("~/faraudit-app"))
home = os.path.expanduser("~")
parts = []

# stdin payload from Claude Code (session_id, transcript_path, cwd, source). Best-effort.
try:
    hook_in = json.load(sys.stdin)
    if not isinstance(hook_in, dict):
        hook_in = {}
except Exception:
    hook_in = {}
transcript_path = hook_in.get("transcript_path") or ""
proj_tx_dir = os.path.dirname(transcript_path) if transcript_path else ""
# current session id — prefer the explicit field, else derive from the transcript filename.
cur_session = hook_in.get("session_id") or ""
if not cur_session and transcript_path:
    cur_session = os.path.splitext(os.path.basename(transcript_path))[0]

# 1) rolling resume pointer
resume = os.path.join(proj, "ceo", "RESUME.md")
if os.path.isfile(resume):
    try:
        with open(resume, encoding="utf-8", errors="replace") as f:
            txt = f.read().strip()
        if txt:
            parts.append(txt[:MAX_RESUME_CHARS])
    except Exception:
        pass


def _belongs_to_this_project(sid):
    """A task dir belongs to THIS project iff its <sid>.jsonl transcript sits next to ours.
    If we couldn't determine our transcript dir, don't over-filter (return True)."""
    if not sid:
        return False
    if not proj_tx_dir:
        return True
    try:
        return os.path.isfile(os.path.join(proj_tx_dir, sid + ".jsonl"))
    except Exception:
        return False


# 2) open tasks from the most-recent PRIOR, SAME-PROJECT task dir that has open work
tasks_root = os.path.join(home, ".claude", "tasks")
try:
    dirs = sorted(
        (d for d in glob.glob(os.path.join(tasks_root, "*/"))),
        key=os.path.getmtime,
        reverse=True,
    )
except Exception:
    dirs = []

for d in dirs:
    sid = os.path.basename(os.path.normpath(d))
    if sid == cur_session:
        continue  # never our own (likely empty) dir — it would hide the prior session's tasks
    if not _belongs_to_this_project(sid):
        continue  # another project's tasks must not leak in
    files = glob.glob(os.path.join(d, "*.json"))
    if not files:
        continue

    def _idkey(p):
        stem = os.path.splitext(os.path.basename(p))[0]
        return int(stem) if stem.isdigit() else 1 << 30

    rows = []
    for fp in sorted(files, key=_idkey):
        try:
            t = json.load(open(fp, encoding="utf-8"))
        except Exception:
            continue
        if isinstance(t, dict) and t.get("status") != "completed":
            rows.append(f"  - [{t.get('status', '?')}] #{t.get('id')}: {t.get('subject', '')}")
    if rows:
        shown = rows[:MAX_TASK_ROWS]
        extra = len(rows) - len(shown)
        block = (
            "OPEN TASKS carried from the last session (re-create with TaskCreate to keep tracking):\n"
            + "\n".join(shown)
        )
        if extra > 0:
            block += f"\n  …and {extra} more."
        parts.append(block)
        break  # stop ONLY after a dir actually yielded open rows

# 3) last-session breadcrumb (written by the SessionEnd hook at the clear moment) — the
#    recovery net if the prior session cleared without checkpointing RESUME.md.
ls = os.path.join(proj, "ceo", ".continuity", "last-session.json")
if os.path.isfile(ls):
    try:
        r = json.load(open(ls, encoding="utf-8"))
        tx = r.get("transcript_path") or ""
        if tx:
            parts.append(
                f"LAST SESSION ended via '{r.get('reason', '?')}' at {r.get('ended_at', '?')}. "
                "If the resume pointer above looks stale (prior session may not have checkpointed), "
                f"recover full detail from the transcript: {tx}"
            )
    except Exception:
        pass

if not parts:
    sys.exit(0)  # nothing to inject — never emit empty context

try:
    ctx = ("═══ CONTINUITY (auto-restored after /clear) ═══\n" + "\n\n".join(parts))[:MAX_TOTAL_CHARS]
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx}}))
except Exception:
    sys.exit(0)
