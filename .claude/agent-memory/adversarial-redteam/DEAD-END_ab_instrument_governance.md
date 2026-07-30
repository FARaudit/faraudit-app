---
name: dead-end-ab-instrument-governance
description: DOCUMENTED DEAD-END (Brain card #639) — A+B instrument-governance (AUDIT_INSTRUMENT_GOVERNANCE) parked; 3× gauntlet F converged on OCR fill-in value-extraction as a single point of failure; feature does not fire on its own N0016 target
metadata:
  type: project
---

# DEAD-END — Invariants A+B / instrument-governance (Brain ruling card #639, 2026-07-21)

**Status: PARKED.** Branch `feat/instrument-governance-ab` UNMERGED, flag `AUDIT_INSTRUMENT_GOVERNANCE` default-OFF, preserved as-is. The record of WHY is kept (here + the artifacts below); the code is dormant.

## What it tried
Flip the N0016726Q1089 NHR (a Navy plumbing SB set-aside where DFARS 252.204-7025(b)(1)=N/A) to a committal verdict, via two typing-layer invariants: (A) definitions-are-not-obligations floor; (B) instrument-scoped trigger inheritance (a clause's dependent sub-obligations go `dormant` when its governing fill-in is off-schema N/A).

## Why it's a dead-end (3 independent gauntlets, all Grade F)
- **R1 (built):** 9 defect classes, 2 false-BID. Build agent's own corpus was green and "blind to every break."
- **R2 (fixed):** 9 NEW classes, 2 false-BID — every guard reconstructed "one axis wider" (vocab lists). Reconstruction-treadmill ([[feedback_reconstruction_treadmill_pivot_recognizer]]).
- **R3 (positive-invariant pivot):** closed R2, but relocated the break to the parser — all guards ride ONE parsed value = single point of failure. 12 breaks, 2 false-BID.
- **DECISIVE:** ran the feature on the REAL N0016 (b)(1) excerpt → **dormant=0, does NOT fire** (real text: "is: _N/A … *is* required prior to award … process/store/transmit CUI" — the value-parser mis-reads the second "is"; CUI trips the demote axis).

**Converged root:** dormancy correctness depends on reliably extracting a fill-in ELECTION from OCR'd tables/checkboxes. That parse is unreliable and cannot be made safe by regex — tighten → over-escalate (doesn't fire on realistic shapes); loosen → false-BID. No regex seam exists between them.

## What held (so nothing is at risk)
Flag-OFF byte-identity proven every round · gold-set 21/21 FALSE-BIDs=0 both flag states · verdict-ordering (dormant never a show-stopper) solid · tsc clean · no regression. Nothing merged, nothing armed.

## The correct behavior (Brain #639-2)
N0016 stays an **honest NHR** — CORRECT on a solicitation with an off-schema fill-in + contradictory clause language, and a sellable artifact ("found one clause it couldn't ground, told you which"). CERT-5 seq-3 CERTIFIED on this run. New census class boundary: **honest-NHR-on-defective-input = NOT retirable, is correct.**

## Revival path (DEMAND-GATED — Brain #639-1)
Option B = structured fill-in extraction (checkbox/table GEOMETRY, not OCR prose) — new Tier-V infra. **No build without a fresh demand card tied to a customer-relevant pathway that requires committal verdicts on fill-in-governed clauses.**

## Artifacts (the documented record)
- Gauntlets: `gauntlet_ab_built.md` · `gauntlet_ab_round2.md` · `gauntlet_ab_round3.md` (this dir).
- Design panel rulings: `design_ab_invariants_attack.md` (this dir) · `../contracts-attorney/design_ab_invariants_ruling.md` · `../cyber-cmmc/design_ab_invariants_review.md` · `../ex-ko/project_dormant_severity_ruling_n0016726q1089.md`.
- Cards: #634 (pivot off #632) · #637 (design) · #638 (design panel) · #639 (park ruling).
