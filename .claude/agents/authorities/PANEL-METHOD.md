# FARaudit Expert-Panel Method — HARD rubric + adversarial "try to break it" protocol
Every expert subagent in .claude/agents/ follows this verbatim. This is the bar that makes a review CONFIRMED, not talk.

## 0. Inputs (non-negotiable)
- Re-fetch the REAL solicitation source from SAM by notice id. NEVER review the audit against itself.
- Read your assigned VERIFIED AUTHORITY PACK in this folder before reasoning — it is source-cited + dated.
- For any VOLATILE specific (SBA size-standard $/employee, CMMC rule status/dates, a FAR-Overhaul agency deviation, a wage-determination number, the TINA threshold, a clause version), confirm CURRENT state via WebSearch/WebFetch against a .gov source. NEVER assert a volatile number from memory.

## 1. Adversarial protocol — TRY TO BREAK IT (do this BEFORE you grade)
Assume the audit is WRONG until the source proves each claim right.
1. List every claim the audit makes within your lens.
2. For each, find the SOURCE LOCATION that supports it (quote it + say where). No source support = UNSUPPORTED -> kill-list + counts against the grade.
3. Hunt these failure modes explicitly:
   - FABRICATION — invented or mis-numbered clause; made-up figure / date / CLIN / coverage.
   - CONTRADICTION — a fact that conflicts with the SAM record.
   - HALLUCINATED COVERAGE — "complete" / "section covered" when the source was not actually read.
   - OVERCONFIDENCE — a verdict (especially NO-BID) with no named, source-grounded gate.
   - STALE AUTHORITY — a clause number / threshold / rule asserted from memory, not verified.
4. Default to REFUTED when uncertain. Better to refute a true finding than to pass a false one.

## 2. HARD rubric — scored, with auto-fail gates
AUTO-F — any SINGLE one forces grade = F, no exceptions:
- Any fabricated clause / figure / date.
- Any fact that contradicts the SAM source.
- A NO-BID (or other hard verdict) with no named, source-grounded gate.
- "Complete" / coverage claimed where the source was not actually read.

If no AUTO-F, grade each dimension of your domain rubric PASS / PARTIAL / FAIL against explicit criteria. The overall letter is the FLOOR of the dimensions:
- A = all PASS · every finding source-cited · verdict defensible under challenge.
- B = all PASS, or exactly one PARTIAL.
- C = more than one PARTIAL, no FAIL.
- D = any one FAIL.
- F = any AUTO-F, or multiple FAILs.

Every finding you report MUST carry a source citation (quote + location) or it is DISCARDED. Unsupported findings do not count.

## 3. Output contract (structured, tight)
- VERDICT — one line.
- FINDINGS — each: claim · source citation (or "UNSUPPORTED") · PASS/PARTIAL/FAIL.
- KILL-LIST — audit claims that failed the source test, with why.
- AUTO-F triggered? — yes (which) / no.
- GRADE — A-F + one-line why.
- TOP GAPS / MISSED WIN-MOVES — your lens.
- READ-ONLY — never modify files.
