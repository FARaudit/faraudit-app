---
name: veto-retirement-stale-ledger
description: Retirement redesign ruling (2026-07-22) — vote A′; the arc's only false-BID datum is computed over a FROZEN coverageV2 the current classifier would not produce
metadata:
  type: project
---

Ruled `ceo/RETIREMENT-REDESIGN-DESIGN.md` from the ex-KO seat: **vote A′** (do not retire; delete
`AUDIT_RETIRE_VERBATIM_VETO`) — but on BURDEN OF PROOF, not on the design's stated evidence. Grade **D**
("right answer, broken proof"). Ruling filed at `ceo/PANEL-REDESIGN-EXKO.md`.

**Why:** `deriveVerdict` replays a run-record's **frozen** `result.inputs.coverageV2`; it never recomputes
`gradeCoverageV2`. Re-running the SHIPPED `importanceOf`/`hasBarSignal` over the arc's decisive record
(`70B01C 999e909b`) under live parity gives **12 frozen entries → 0** (all `ambiguous` + bar-signal-negative ⇒
demoted by the live-armed `AUDIT_AMBIGUOUS_SIGNAL_DEMOTION`). So the "false-BID at retirement" measures a
superseded classifier. Also: `_shadow-acceptance-corpus.ts:5` sets `AUDIT_SELF_CLEARABLE_PACKAGE=true` outside
the `--config` block and omits it from the CONFIGURATION stamp — flipping that one flag turns the false-BID into
a benign NHR→INCOMPLETE flip.

**Why it matters:** this is L40-D3 (parity) extended from FLAGS to DATA, and L40's carried-forward-evidence
placebo reproduced in the INPUT layer. Proposed as `LESSONS.md` **L40-D4 — THE SUBSTRATE RULE**.

**How to apply:** never let a banked run-record's serialized `coverageV2` certify anything at the veto/coverage
layer — recompute from raw attestations under live flags, or stamp the record NOT MEASURABLE. When measuring
this engine, re-derive rather than replay whenever the control under test lives upstream of the frozen field.

Other measured facts worth reusing (44 records / **17 distinct sols** / 12 with usable full source):
NHR rate 29/44 (66%) veto-intact vs 26/44 retired; the **notice-body eligibility floor drives 11** NHRs vs the
veto's 10 labels / **3 deciding** — the crying-wolf fight belongs at the notice-body floor, not the veto.
Widening `obligationsOf` (Option B) costs ~+4.5 escalation drivers per solicitation; the verb-less half measured
4/5 over-fire and 0 real bars.
