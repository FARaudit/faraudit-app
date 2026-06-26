#!/usr/bin/env python3
# G15b — redact secrets from Bash output before it enters the transcript
# (CEO-approved 2026-06-22, narrow-but-comprehensive: pattern-based on real secret
# shapes so security stays the priority, while git SHAs/hashes/base64 stay readable).
# PostToolUse hook on Bash. Only emits a rewrite when something was actually redacted.
import sys, json, re

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
out = data.get("tool_output") or ""
if not isinstance(out, str) or not out:
    sys.exit(0)

PATTERNS = [
    (re.compile(r'sk-ant-[A-Za-z0-9_-]{8,}'), '***REDACTED-ANTHROPIC-KEY***'),
    (re.compile(r'\bsk-[A-Za-z0-9]{20,}'), '***REDACTED-OPENAI-KEY***'),
    (re.compile(r'\bsk_(?:live|test)_[A-Za-z0-9]{10,}'), '***REDACTED-STRIPE-KEY***'),
    (re.compile(r'\brk_(?:live|test)_[A-Za-z0-9]{10,}'), '***REDACTED-STRIPE-KEY***'),
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), '***REDACTED-AWS-KEY***'),
    (re.compile(r'\bgh[posru]_[A-Za-z0-9]{20,}'), '***REDACTED-GITHUB-TOKEN***'),
    (re.compile(r'\bgithub_pat_[A-Za-z0-9_]{20,}'), '***REDACTED-GITHUB-TOKEN***'),
    (re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{10,}'), '***REDACTED-SLACK-TOKEN***'),
    (re.compile(r'\bAIza[A-Za-z0-9_-]{30,}'), '***REDACTED-GOOGLE-KEY***'),
    # JWT (3 dot-separated b64url segments, eyJ header)
    (re.compile(r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'), '***REDACTED-JWT***'),
    (re.compile(r'(Bearer\s+)[A-Za-z0-9._-]{20,}'), r'\1***REDACTED***'),
    # KEY=value / "secret": "value" style assignments (case-insensitive)
    (re.compile(
        r'(?i)((?:api[_-]?key|access[_-]?key|secret(?:[_-]?key)?|token|password|passwd|pwd|'
        r'private[_-]?key|service[_-]?role(?:[_-]?key)?|client[_-]?secret|refresh[_-]?token)'
        r'["\']?\s*[:=]\s*["\']?)([A-Za-z0-9._/+\-]{12,})'),
        r'\1***REDACTED***'),
    # PEM private key blocks
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----'),
        '***REDACTED-PRIVATE-KEY***'),
]

red = out
for pat, repl in PATTERNS:
    red = pat.sub(repl, red)

if red != out:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "updatedToolOutput": red}}))
sys.exit(0)
