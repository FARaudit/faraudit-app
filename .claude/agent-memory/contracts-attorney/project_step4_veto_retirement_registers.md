---
name: step4-veto-retirement-registers
description: Step-4 veto-retirement seat ruling — the 4 named registers die at obligationsOf's 8-verb filter, NOT at the veto; ledger-ownership claim is false; gate must be verdict-scoped
metadata:
  type: project
---

Step-4 (verbatim-veto retirement) contracts seat ruling, 2026-07-22 — `ceo/PANEL-STEP4-CONTRACTS.md`.
Grade **C** as scoped, **A** with amendments A1–A5.

**The load-bearing measured fact (executed; ex-KO seat reproduced it independently):**
`obligationsOf` (`audit-orchestrator.ts:306-310`) splits on `/(?<=[.;\n])/` and keeps only sentences matching
`/\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/` — applied BEFORE `CoverageV2` exists, so no
flag state of `AUDIT_RETIRE_VERBATIM_VETO` touches it. Consequence-framed §M ("will not be evaluated" / "will
be determined technically unacceptable and ineligible for award") and annex-access ("only contractors
possessing … may request the classified annex") enumerate **0 obligations**. An enumerated `(1)/(2)/(3)` list
keeps only the colon-stem fragment (quoting the benign SAM item; the FCL item is dropped). Submit-proof §L is
typed **boilerplate** by `BOILERPLATE_RE`'s `shall submit` token (no `!BAR_SIGNAL_RE` guard on that branch,
unlike NOOP-REP at `audit-gate-v2.ts:302`).

**Why:** the retirement memo, `VERDICT-ARC-DESIGN.md`'s supersession block and `GRAVEYARD-HARDBAR-PART-A.md`
§D all assign these registers to "the v2 obligation ledger + lenses + #575". The **ledger half is a null
assignment** — a placebo *owner*, the same error Brain killed part A for (#677) one layer down. Retirement's
real marginal loss is only the modal-verb variants ("is *required* for award") that do enumerate.

**How to apply:**
- Never accept a false-BID count over `CoverageV2` buckets as a retirement gate — measure the **VERDICT** over
  labelled specimens in each register's real typeset form (zero-obligation phrasings included). Absence of
  flips in the 40 banked records for these registers is silence from invisibility, not safety.
- Legal grades to reuse: §M acceptability gate = **protest-grade**, non-curable (FAR 15.101-2, verified
  verbatim). Submit-proof §L = **caveat-grade** by default (responsibility, curable to award — FAR 9.103(b));
  protest-grade only in sealed bidding (FAR 14.301(a)), §M-coupled, or long-lead credential. DD-254 block 1a =
  **caveat-grade** (performance-time FCL, DCSA-sponsored); annex access is a separate protest-grade register.
  SF1449 block 10 = set-aside → already owned by structured mechanisms, BWC cap, never NHR.
- My closed-class rule (`[[project_move4_hardbar_floor_ruling]]`, FAR 16.505(b)(1)(i) / 52.209-1) reaches
  **none** of the four — all are joinable, self-certified, or consequence registers. Do not stretch it.
- Every "#575 owns it" routing needs a live check that a **null profile fails to CAUTION, not to CLEAR**
  (`AUDIT_ELIGIBLE_TRISTATE`, documented default-OFF at `audit-decide.ts:3215`).
Related: [[project_verdict_arc_verbatim_veto_two_functions]].
