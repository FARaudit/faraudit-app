# CMMC/Cyber lens review — Design Invariants A+B (N0016726Q1089 root fix)
Reviewer: DoD cyber/CMMC lens · as-of 2026-07-21 · READ-ONLY (no prod code touched)
Grounding verified live this session (acquisition.gov / ecfr.gov / Federal Register 2025-17359).

## VERIFIED AUTHORITY (live, this session)
- 252.204-7025 = solicitation PROVISION; 252.204-7021 = contract CLAUSE. [acquisition.gov 252.204-7025; Summit7]
- 7025(b)(1) fill-in = EXACTLY four CO-inserted options: CMMC Level 1 (Self) · Level 2 (Self) · Level 2 (C3PAO) · Level 3 (DIBCAC). No "N/A" option in the provision text. [acquisition.gov 252.204-7025]
- 7025(a) = DEFINITIONS (CUI, "current", CMMC status, CMMC UID, FCI, POA&M) — cross-refs 7021 defs. Imposes no duty.
- 7025(b)(2)(i) = offeror must have current CMMC status at required level posted in SPRS.
- 7025(b)(2)(ii) = current affirmation of continuous compliance (32 CFR 170) in SPRS.
- 7025(c) = if CONDITIONAL status, must close out POA&M to final (32 CFR 170.21).
- 7025(d) = provide CMMC UID(s) for each system processing/storing/transmitting FCI/CUI; update as new UIDs generated.
- Rule status: DFARS CMMC clause rule (Case 2019-D041) EFFECTIVE 2025-11-10. Phase-in: Phase 1 (11/10/2025) L1-Self / L2-Self (+ L2-C3PAO at DoD discretion); Phase 2 (11/10/2026) L2-C3PAO required; discretionary inclusion across 3-yr phase-in. [Fed Reg 2025-17359, 2025-09-10; Summit7; Crowell]
  NOTE: authority pack listed 2026-05-07 — LIVE sources say 2025-11-10 effective. Pack is STALE on this date; flagged, not used from memory.

## ITEM RULINGS

### 1. Permitted-schema for 7025(b)(1) — CONCERN
- On-schema set {L1-Self, L2-Self, L2-C3PAO, L3-DIBCAC} is CORRECT and CONFIRMED against the live provision text.
- "N/A" is TRULY off-schema — the provision offers no N/A checkbox. CORRECT.
- BUT the design's binary on-schema/off-schema partition treats ALL non-matching fills identically ("off-schema/N/A/absent -> dormant+BWC"). Real-world fills the KO/OCR will produce that the partition must NOT silently misroute:
  * blank / struck-through / "[CO to insert]" template artifact -> this is S3 (ambiguous/absent). Design ALREADY carves S3 as a TRIPWIRE (never reconcile, escalate). GOOD — but the partition text in step (4) lumps "absent" INTO the dormant->BWC bucket ("off-schema/N/A/absent -> DORMANT"). That CONTRADICTS S3. A blank fill is NOT confirmably "no level required"; it is unknown. Absent must route to S3-escalate, NOT to dormant-BWC.
  * "None" / "Not required" / "Not applicable" prose -> semantically = N/A (KO signalling no level). Dormant-BWC is defensible ONLY if grounded as an affirmative CO statement, not an empty cell.
  * a level WITHOUT assessment-type ("Level 2" bare, no Self/C3PAO) -> this is a PATENT DEFECT the design does not name. Level 2 is ambiguous between Self and C3PAO — materially different eligibility bars (Phase 1 vs Phase 2 timing, self-attest vs third-party cert). This must NOT be treated as on-schema "real level -> dependents live as typed" because WHICH bar is live is undetermined. It must route to S3/BWC "confirm assessment type with KO", NOT to clean typed dependents.
- REQUIRED AMENDMENT: split the off-schema bucket into (a) confirmable-no-level (grounded N/A/None/Not-required prose) -> dormant+BWC; (b) unknown/absent/blank/level-without-type -> S3 escalate. Do not collapse "absent" into "N/A".

### 2. Invariant B partition on the 7025 family — CONCERN
- Premise "dependents dormant when (b)(1) off-schema/N/A" is STRUCTURALLY sound for the SPRS-status obligations ((b)(2)(i), (b)(2)(ii), (c), (d)) — each is expressly conditioned on the level required by (b)(1). No level required -> no SPRS status obligation at that level -> INOPERATIVE. CORRECT for these sub-parts.
- (a) DEFINITIONS: correctly NOT an obligation (Invariant A drops it independently). PASS.
- (c) POA&M closeout: conditioned on having a CONDITIONAL status at the required level. Dormant when (b)(1)=N/A. CORRECT.
- LIVE-EVEN-WHEN-(b)(1)=N/A risk: 7025's OWN sub-parts are all level-conditioned, so within the provision the dormant partition holds. HOWEVER — see item 4 — the dormant partition is scoped to the 7025 INSTANCE. If the finding-typer inherited a CUI/FCI-handling obligation from a CO-LOCATED clause (7012, 7021, 7019/7020) into the same normalized-cite group, dormancy could wrongly suppress it. The instance-grouping (normalized cite + section/occurrence) must be TIGHT: 7025(b)(1)=N/A may ONLY dormant-ize 7025's own dependents, never a sibling cyber clause. Confirm the group key cannot collide 7025 with 7021/7012.

### 3. S2 on-schema real level — is (d) a gate_to_clear or bidder_cannot_move? -> CONCERN (design under-specifies; engine's dual-typing is the live bug)
- The live run typed the IDENTICAL (d) text BOTH ways. CORRECT answer: (d) [and (b)(2)(i)/(ii)] is a **gate_to_clear / bidder_controls** obligation, NOT a firm-inherent bidder_cannot_move bar — PROVIDED the offeror can obtain the status. But it is CONDITIONALLY a hard bar:
  * If required level = L1-Self or L2-Self: offeror can self-assess + post to SPRS + affirm -> bidder CONTROLS it -> gate_to_clear. Providing the CMMC UID (d) is a submission act the bidder performs -> gate_to_clear.
  * If required level = L2-C3PAO or L3-DIBCAC and the bidder does NOT already hold a current third-party/DIBCAC assessment at bid/award: this is effectively bidder_cannot_move at THIS award — a C3PAO/DIBCAC assessment cannot be manufactured inside a typical response window; SPRS status must be CURRENT at award (7025(b)(2)(i)). That is a silent bid-killer.
- So the correct typing is CONDITIONAL ON (assessment-type x whether the bidder already holds current status), which the engine cannot know from the solicitation alone (it's a bidder-profile fact — the frozen #575 bidder-HOLD discriminator problem). The SAFE typing given no bidder profile: gate_to_clear WITH a BWC/caution surfacing "L2-C3PAO/L3 requires a CURRENT third-party/government assessment posted in SPRS at award — verify you hold it; cannot be obtained inside a response window." Never emit a flat bidder_cannot_move (over-fires bidders who already hold cert) and never emit a clean silent gate_to_clear for a C3PAO/L3 level (under-fires the silent bid-killer).
- REQUIRED AMENDMENT: the design's "S2 on-schema real level -> dependents stay AS TYPED (no suppression)" is INCOMPLETE — it must SPECIFY the correct target typing (gate_to_clear + assessment-type-conditioned caution), not merely "as typed", or it re-blesses whichever way the lens happened to type it (the exact live defect). This is the biggest substantive cyber gap.

### 4. Interaction with 252.204-7021 (companion clause, by-reference, level unspecified) -> CONCERN / partial FAIL risk
- 7021 is the OPERATIVE contract clause carrying the CMMC compliance requirement; 7025 is only the solicitation NOTICE. Per the final rule, they are prescribed together. If 7021 is present (even by reference) but 7025(b)(1)=N/A, the design's dormant partition — scoped to 7025 — would NOT touch 7021. That is the RIGHT outcome ONLY IF the typer doesn't group 7021 into the 7025 N/A instance.
- REAL RISK the design does not address: an N/A in 7025(b)(1) while 7021 is incorporated is a CONTRADICTORY solicitation (notice says no level; contract clause imposes CMMC). Per 204.7503 prescription logic + the mandatory four-option fill-in, both are inserted TOGETHER only when a level applies; 7021 present + 7025=N/A is a PATENT DEFECT/ambiguity, not a clean dormant. Dormant-partition suppressing 7025 while leaving 7021 untyped could yield a FALSE-benign readout. This must escalate to BWC "confirm CMMC level with KO — 7021 present but level not stated in 7025", NOT silently dormant. The design's dormant->BWC vector (iii) covers this IF the BWC actually names the 7021/7025 conflict; the brief does not guarantee it does.
- REQUIRED AMENDMENT: when 7021 is detected present AND 7025(b)(1) is off-schema/N/A/absent, force S3-escalate-or-BWC-with-explicit-7021-conflict-reason. Do NOT let dormancy alone stand — 7021 independently signals a live CMMC gate.

### 5. Dormant->BWC (vector iii) severity from a CMMC-risk view -> PASS (with the item-3/item-4 caveats)
- An off-schema/N/A CMMC fill-in IS a real thing a bidder must confirm with the KO — it is NOT noise. Rationale: (a) the CO fill-in is mandatory and structured; a defect in it is a patent ambiguity the offeror has a DUTY to raise pre-award (or risk waiver); (b) if 7021 is nonetheless in the contract, the bidder inherits a CMMC obligation the notice failed to scope — a genuine award-eligibility risk; (c) at minimum the offeror must confirm no SPRS status is needed before relying on it. BWC ("confirm with KO") is the CALIBRATED, honest verdict — it does not cry wolf (it doesn't call NO-BID), and it does not under-warn (it doesn't bless a clean BID over a defective eligibility instrument). Capping an otherwise-clean BID to BWC for one dormant CMMC family is CORRECT here BECAUSE cyber is a silent bid-killer class — the asymmetry favors the flag. This is fail-toward-honesty, and it is justified.

## KILL-LIST (design claims that fail the source test)
- "204.7504 says OMIT the clause when no level is required" (brief line 6): the PRINCIPLE is correct (provision inserted only when a level applies; four-option mandatory fill-in leaves no N/A) but the CITATION is likely mis-numbered — the CMMC prescription lives at DFARS 204.7503 (policy) / 204.75 subpart, not 204.7504. VERIFY the exact prescription section before hard-coding it as the authority string. Do not ship "204.7504" unconfirmed.
- Partition step (4) "off-schema/N/A/absent -> DORMANT" CONTRADICTS the design's own S3 tripwire ("absent -> never reconcile, escalate"). Internal inconsistency — absent must NOT be in the dormant bucket.

## AUTO-F check: none triggered (this is a design review, no fabricated clause/figure; rule status verified live, not from stale pack).

## VERDICT: APPROVE-WITH-AMENDMENTS
Required amendments (cyber-lens, blocking for grade A on build):
1. Split the off-schema bucket: grounded-N/A/None/Not-required prose -> dormant+BWC; blank/absent/struck/level-without-assessment-type -> S3 escalate (do NOT dormant-ize "absent"; reconcile brief line 11 with S3).
2. S2 must SPECIFY the target typing for a real on-schema level = gate_to_clear/bidder_controls + an assessment-type-conditioned caution (L2-C3PAO/L3 => "current third-party/DIBCAC assessment must be posted in SPRS at award; unobtainable in a response window"). Never flat bidder_cannot_move, never silent clean gate. This is the fix for the live dual-typing bug.
3. When 7021 is present AND 7025(b)(1) off-schema/N/A -> force explicit-conflict BWC/S3 (7021 independently creates a live CMMC gate the dormant partition must not suppress). Verify instance-group key cannot merge 7025 with 7021/7012/7019-7020.
4. Fix the prescription citation (204.7503 vs the brief's 204.7504) before hard-coding.

Single biggest cyber risk: item 3 — "dependents stay AS TYPED" re-blesses the exact ambiguity that caused the live NHR; the design must name the correct disposition, not defer to the lens.
