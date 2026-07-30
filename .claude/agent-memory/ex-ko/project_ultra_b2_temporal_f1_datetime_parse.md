---
name: ultra-b2-temporal-f1-datetime-parse
description: ULTRA B2/B3 ruling — all 4 claims UPHELD but P1 live-proven, SAM responseDeadLine datetime never parses so live-deadline CLOSED is dead code; naive fix arms a tz false-CLOSED P0
metadata:
  type: project
---

ULTRA B2+B3 review (2026-07-22, grade C): claims B2.1/B2.2/B2.3/B3 all UPHELD — but **F1 (P1, live-proven on 3 real records via the production fetch path):** SAM v2 `responseDeadLine` is always `YYYY-MM-DDTHH:MM:SS±HH:MM` and `parseSolicitationDate` (audit-temporal.ts:34) returns null on it — the ISO regex's trailing `\b` fails on digit→`T`. So the live-past-deadline CLOSED branch (temporal.ts:148-153) is unreachable in production; a never-amended past-deadline-but-active sol (SAM archive lags deadline 15-30d) reads OPEN → committal BID.

**Why:** all three banked suites use date-only fixtures ("2026-07-15") — a format SAM does not emit — so they stay green over the defect.

**How to apply:**
- The fix MUST compare **instants** (full offset-bearing datetime vs now), never date-parts: `today` at executor-v3:580 is the **UTC** date, so a date-only fix arms a tz off-by-one false-CLOSED (10PM-EDT / 3PM-HST deadlines tonight read dd=-1 → CLOSED while open) — the silently-fatal P0 the panel forbade.
- Any suite touching `responseDeadLine` must include a `T…±HH:MM` specimen.
- Other rulings banked: CLOSED-before-INCOMPLETE is CORRECT by construction (zero-amendment precondition); archived+future-deadline contradiction → CLOSED is spec-sanctioned but unhardened (P2); upload path bypasses the liveness gate entirely (P2 design gap); decide:3338 comment misdescribes the 1-PRE/show-stopper order.
- Full report: `ceo/ULTRA-B2-TEMPORAL.md` · probes: `scripts/audit-ai/_ultra-b2-temporal.ts`. Related: [[project_verdict_arc_temporal_ruling]].
