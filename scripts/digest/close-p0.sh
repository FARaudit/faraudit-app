#!/usr/bin/env bash
# close-p0.sh — atomic P0 closure tool (Rule 41: action-item parity)
#
# Removes a P0 entry from p0[], pushes a rich entry to completionsLog,
# recomputes kpi_counters from arrays, then syncs disk → inline JSON.
#
# All-or-nothing: on any failure prior to disk write, no mutation occurs.
# On disk-write success, inline sync is mandatory (Rule 40).

set -euo pipefail

DIGEST_DIR="$HOME/faraudit-app/ceo"
DISK_JSON="$DIGEST_DIR/digest-data.json"
INLINE_HTML="$DIGEST_DIR/ceo-digest-canonical.html"
SYNC_SCRIPT="$DIGEST_DIR/update-digest.sh"

usage() {
    cat <<'EOF'
close-p0.sh — atomic P0 closure (Rule 41)

USAGE:
    close-p0.sh <P0-ID> <closure_note> [--evidence <ref>] [--commit <sha>] [--dry-run]
    close-p0.sh -h | --help

ARGS:
    P0-ID            Required. e.g. P0-26, P0-27a
    closure_note     Required. One-line summary of what was shipped.

OPTIONS:
    --evidence REF   Optional. File path, URL, or section ref for verification.
    --commit SHA     Optional. Git commit short SHA.
    --dry-run        Preview the mutation without writing to disk.
    -h, --help       Show this help.

EXIT CODES:
    0  Success, or ID already closed (idempotent).
    1  Mutation / sync failure.
    2  ID not found in p0[] AND not in completionsLog.

EXAMPLES:
    close-p0.sh P0-30 "Glance reorg shipped" --commit abc1234
    close-p0.sh P0-26 "fix complete" --dry-run
EOF
}

# ── arg parsing ────────────────────────────────────────────────────────────
P0_ID=""
CLOSURE_NOTE=""
EVIDENCE=""
COMMIT=""
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)
            usage; exit 0 ;;
        --dry-run)
            DRY_RUN=1; shift ;;
        --evidence)
            EVIDENCE="${2:-}"; shift 2 ;;
        --commit)
            COMMIT="${2:-}"; shift 2 ;;
        --*)
            echo "ERROR: unknown flag: $1" >&2
            usage >&2; exit 1 ;;
        *)
            if [ -z "$P0_ID" ]; then
                P0_ID="$1"
            elif [ -z "$CLOSURE_NOTE" ]; then
                CLOSURE_NOTE="$1"
            else
                echo "ERROR: extra positional arg: $1" >&2
                usage >&2; exit 1
            fi
            shift ;;
    esac
done

if [ -z "$P0_ID" ] || [ -z "$CLOSURE_NOTE" ]; then
    echo "ERROR: P0-ID and closure_note are required." >&2
    usage >&2
    exit 1
fi

# ── preflight ──────────────────────────────────────────────────────────────
[ -f "$DISK_JSON" ]    || { echo "FATAL: missing $DISK_JSON" >&2; exit 1; }
[ -f "$INLINE_HTML" ]  || { echo "FATAL: missing $INLINE_HTML" >&2; exit 1; }
[ -x "$SYNC_SCRIPT" ]  || { echo "FATAL: missing or non-exec $SYNC_SCRIPT" >&2; exit 1; }

# ── PHASE 0 · lookup ───────────────────────────────────────────────────────
# Returns JSON: {state, title, status, section, owner, closed_at, closure_note_preview}
# state ∈ {NOT_FOUND, ALREADY_CLOSED, FOUND}

LOOKUP_EXIT=0
LOOKUP_JSON=$(python3 <<PYEOF
import json, sys
disk = json.load(open("$DISK_JSON"))
p0_id = "$P0_ID"
p0_entries = disk.get("p0", [])
log_entries = disk.get("completionsLog", [])

open_match  = next((x for x in p0_entries if x.get("id") == p0_id and x.get("status") == "open"), None)
any_p0      = next((x for x in p0_entries if x.get("id") == p0_id), None)
log_match   = next((x for x in log_entries if isinstance(x, dict) and x.get("id") == p0_id and x.get("status") == "closed"), None)

if log_match:
    out = {
        "state": "ALREADY_CLOSED",
        "title": log_match.get("title", ""),
        "status": "closed",
        "section": log_match.get("original_section", ""),
        "owner": log_match.get("owner", ""),
        "closed_at": log_match.get("completed_at", ""),
        "closure_note_preview": (log_match.get("closure_note", "") or "")[:120],
    }
elif open_match:
    out = {
        "state": "FOUND",
        "title": open_match.get("title", ""),
        "status": open_match.get("status", ""),
        "section": open_match.get("section", ""),
        "owner": open_match.get("owner", ""),
        "closed_at": "",
        "closure_note_preview": "",
    }
elif any_p0:
    # exists in p0[] but with non-open status and no log entry — closure-drift edge
    out = {
        "state": "FOUND",
        "title": any_p0.get("title", ""),
        "status": any_p0.get("status", ""),
        "section": any_p0.get("section", ""),
        "owner": any_p0.get("owner", ""),
        "closed_at": "",
        "closure_note_preview": "",
    }
else:
    out = {"state": "NOT_FOUND", "title": "", "status": "", "section": "",
           "owner": "", "closed_at": "", "closure_note_preview": ""}

print(json.dumps(out))
PYEOF
) || LOOKUP_EXIT=$?
LOOKUP_EXIT=${LOOKUP_EXIT:-0}
if [ "$LOOKUP_EXIT" -ne 0 ]; then
    echo "FATAL: lookup failed (exit $LOOKUP_EXIT)" >&2
    exit 1
fi

STATE=$(echo "$LOOKUP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')

case "$STATE" in
    NOT_FOUND)
        echo "ERROR: $P0_ID not found in p0[] or completionsLog." >&2
        exit 2 ;;
    ALREADY_CLOSED)
        CLOSED_AT=$(echo "$LOOKUP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["closed_at"])')
        TITLE=$(echo "$LOOKUP_JSON"     | python3 -c 'import json,sys; print(json.load(sys.stdin)["title"])')
        echo "IDEMPOTENT: $P0_ID is already closed."
        echo "  title:     $TITLE"
        echo "  closed_at: $CLOSED_AT"
        echo "  (no mutation performed)"
        exit 0 ;;
    FOUND)
        : ;;
    *)
        echo "FATAL: unexpected lookup state: $STATE" >&2
        exit 1 ;;
esac

TITLE=$(echo   "$LOOKUP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["title"])')
SECTION=$(echo "$LOOKUP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["section"])')
OWNER=$(echo   "$LOOKUP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner"])')

# ── PHASE 1 · dry-run preview ──────────────────────────────────────────────
echo "─── close-p0.sh ───────────────────────────────────────────────"
echo "  id:       $P0_ID"
echo "  title:    $TITLE"
echo "  section:  $SECTION"
echo "  owner:    $OWNER"
echo "  note:     $CLOSURE_NOTE"
[ -n "$EVIDENCE" ] && echo "  evidence: $EVIDENCE"
[ -n "$COMMIT"   ] && echo "  commit:   $COMMIT"
echo "───────────────────────────────────────────────────────────────"

if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY-RUN: would remove $P0_ID from p0[], append to completionsLog,"
    echo "         recompute kpi_counters, sync disk→inline. No mutation."
    exit 0
fi

# ── PHASE 2 · backups ──────────────────────────────────────────────────────
TS=$(date +%Y%m%d-%H%M%S)
DISK_BACKUP="$DIGEST_DIR/.backups/digest-data.${P0_ID}.${TS}.json"
INLINE_BACKUP="$DIGEST_DIR/.backups/ceo-digest-canonical.${P0_ID}.${TS}.html"
mkdir -p "$DIGEST_DIR/.backups"
cp "$DISK_JSON"   "$DISK_BACKUP"
cp "$INLINE_HTML" "$INLINE_BACKUP"
echo "BACKUP: $DISK_BACKUP"
echo "BACKUP: $INLINE_BACKUP"

# ── PHASE 3 · disk mutation (atomic) ───────────────────────────────────────
P0_ID_ENV="$P0_ID" \
CLOSURE_NOTE_ENV="$CLOSURE_NOTE" \
EVIDENCE_ENV="$EVIDENCE" \
COMMIT_ENV="$COMMIT" \
TITLE_ENV="$TITLE" \
SECTION_ENV="$SECTION" \
OWNER_ENV="$OWNER" \
DISK_JSON_ENV="$DISK_JSON" \
python3 <<'PYEOF'
import json, os, sys
from pathlib import Path
from datetime import datetime, timezone

disk_path    = Path(os.environ["DISK_JSON_ENV"])
p0_id        = os.environ["P0_ID_ENV"]
closure_note = os.environ["CLOSURE_NOTE_ENV"]
evidence     = os.environ.get("EVIDENCE_ENV", "")
commit       = os.environ.get("COMMIT_ENV", "")
title        = os.environ.get("TITLE_ENV", "")
section      = os.environ.get("SECTION_ENV", "")
owner        = os.environ.get("OWNER_ENV", "")

disk = json.loads(disk_path.read_text())

# remove from p0[]
before_len = len(disk.get("p0", []))
disk["p0"] = [x for x in disk.get("p0", []) if x.get("id") != p0_id]
after_len = len(disk["p0"])
if after_len != before_len - 1:
    print(f"FATAL: expected to remove exactly 1 entry from p0[], removed {before_len - after_len}", file=sys.stderr)
    sys.exit(1)

# push rich entry to completionsLog (prepend — newest first)
entry = {
    "id": p0_id,
    "title": title,
    "completed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "owner": owner,
    "status": "closed",
    "closure_note": closure_note,
    "removed_from_p0": True,
    "original_section": section,
    "original_title": title,
}
if evidence:
    entry["evidence"] = evidence
if commit:
    entry["commit"] = commit

disk.setdefault("completionsLog", []).insert(0, entry)

# recompute kpi_counters from arrays
kpi = disk.setdefault("kpi_counters", {})
p0_open_list = [x for x in disk["p0"] if x.get("status") == "open"]
kpi["p0_open"]        = len(p0_open_list)
kpi["p0_blocker"]     = sum(1 for x in p0_open_list if x.get("blocker"))
kpi["p0_blockers"]    = kpi["p0_blocker"]
kpi["p0_owner_ceo"]   = sum(1 for x in p0_open_list if "ceo"  in (x.get("owner","").lower()) and "code" not in (x.get("owner","").lower()))
kpi["p0_owner_code"]  = sum(1 for x in p0_open_list if "code" in (x.get("owner","").lower()) and "ceo"  not in (x.get("owner","").lower()))
kpi["p0_owner_ceo_plus_code"] = sum(1 for x in p0_open_list if "ceo" in (x.get("owner","").lower()) and "code" in (x.get("owner","").lower()))
kpi["p0_owner_both"]  = kpi["p0_owner_ceo_plus_code"]
kpi["p1_open"]        = sum(1 for x in disk.get("p1", []) if x.get("status") == "open")
kpi["p2_open"]        = sum(1 for x in disk.get("p2", []) if x.get("status") == "open")
kpi["completions_total"] = len([x for x in disk.get("completionsLog", []) if isinstance(x, dict) and x.get("status") == "closed"])

# atomic write with try/finally cleanup
tmp = disk_path.with_suffix(".json.tmp")
try:
    tmp.write_text(json.dumps(disk, indent=2, ensure_ascii=False))
    os.replace(str(tmp), str(disk_path))
finally:
    if tmp.exists():
        tmp.unlink()

print(f"MUTATION-OK: removed {p0_id} from p0[] · pushed to completionsLog · p0_open={kpi['p0_open']}")
PYEOF

# ── PHASE 4 · disk → inline sync (Rule 40) ─────────────────────────────────
echo "SYNC: invoking update-digest.sh (disk → inline)..."
SYNC_EXIT=0
( cd "$HOME/faraudit-app" && bash "$SYNC_SCRIPT" ) || SYNC_EXIT=$?
if [ "$SYNC_EXIT" -ne 0 ]; then
    echo "FATAL: disk→inline sync failed (exit $SYNC_EXIT)." >&2
    echo "       Disk JSON was mutated but inline HTML is now STALE." >&2
    echo "       Restore from backups:" >&2
    echo "         cp $DISK_BACKUP   $DISK_JSON" >&2
    echo "         cp $INLINE_BACKUP $INLINE_HTML" >&2
    exit 1
fi

# ── PHASE 5 · verification ─────────────────────────────────────────────────
P0_ID_ENV="$P0_ID" \
DISK_JSON_ENV="$DISK_JSON" \
INLINE_HTML_ENV="$INLINE_HTML" \
python3 <<'PYEOF'
import json, os, re, sys
from pathlib import Path

p0_id        = os.environ["P0_ID_ENV"]
disk_path    = Path(os.environ["DISK_JSON_ENV"])
inline_path  = Path(os.environ["INLINE_HTML_ENV"])

disk = json.loads(disk_path.read_text())

# disk checks
if any(x.get("id") == p0_id for x in disk.get("p0", [])):
    print(f"FATAL: disk verification: {p0_id} still present in p0[]", file=sys.stderr); sys.exit(1)
log_hit = next((x for x in disk.get("completionsLog", []) if isinstance(x, dict) and x.get("id") == p0_id and x.get("status") == "closed"), None)
if not log_hit:
    print(f"FATAL: disk verification: {p0_id} not in completionsLog with status=closed", file=sys.stderr); sys.exit(1)
disk_p0_open = sum(1 for x in disk.get("p0", []) if x.get("status") == "open")
if disk.get("kpi_counters", {}).get("p0_open") != disk_p0_open:
    print(f"FATAL: disk verification: kpi_counters.p0_open ({disk['kpi_counters'].get('p0_open')}) != actual ({disk_p0_open})", file=sys.stderr); sys.exit(1)

# inline checks
html = inline_path.read_text()
m = re.search(r'<script[^>]+id="digest-data"[^>]*>(.*?)</script>', html, flags=re.DOTALL)
if not m:
    print("FATAL: inline verification: cannot find <script id=\"digest-data\"> block", file=sys.stderr); sys.exit(1)
raw = m.group(1)
raw = raw.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
inline = json.loads(raw)

if any(x.get("id") == p0_id for x in inline.get("p0", [])):
    print(f"FATAL: inline verification: {p0_id} still present in p0[]", file=sys.stderr); sys.exit(1)
inline_log_hit = next((x for x in inline.get("completionsLog", []) if isinstance(x, dict) and x.get("id") == p0_id and x.get("status") == "closed"), None)
if not inline_log_hit:
    print(f"FATAL: inline verification: {p0_id} not in completionsLog with status=closed", file=sys.stderr); sys.exit(1)
if inline.get("kpi_counters", {}).get("p0_open") != disk.get("kpi_counters", {}).get("p0_open"):
    print(f"FATAL: inline/disk counter divergence: inline={inline.get('kpi_counters',{}).get('p0_open')} disk={disk.get('kpi_counters',{}).get('p0_open')}", file=sys.stderr); sys.exit(1)

print(f"VERIFY-OK: disk + inline both show {p0_id} closed · p0_open={disk['kpi_counters']['p0_open']}")
PYEOF

# ── PHASE 6 · summary ──────────────────────────────────────────────────────
echo "─── CLOSED ────────────────────────────────────────────────────"
echo "  $P0_ID · $TITLE"
echo "  note: $CLOSURE_NOTE"
[ -n "$EVIDENCE" ] && echo "  evidence: $EVIDENCE"
[ -n "$COMMIT"   ] && echo "  commit:   $COMMIT"
echo "  backups: $DISK_BACKUP"
echo "           $INLINE_BACKUP"
echo "───────────────────────────────────────────────────────────────"
exit 0
