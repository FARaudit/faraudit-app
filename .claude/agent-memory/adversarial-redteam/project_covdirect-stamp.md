---
name: covdirect-stamp
description: FINAL DRY-STAMP of the covered_direct HARD-BAR floor R4 (AUDIT_COVERED_DIRECT_BAR_FLOOR) @7eb7cbb — grade A/DRY. Both prior-cert (R3) over-fires CLOSED; under-fire=0, over-fire=0 in scope; nothing survives.
metadata:
  type: project
---

# covered_direct HARD-BAR floor — DRY-STAMP (branch phase2-emission-grounding-548 @ 7eb7cbb, R4)

**DRY GRADE: A (DRY) on the fidelity axis — nothing survives.** In-scope UNDER-FIRE = 0 · OVER-FIRE = 0.
No AUTO-F (no fabrication, no SAM contradiction, no ungrounded NO-BID; direction is the SAFE escalate pole).
Flag-OFF byte-identical (proven). Builder prod-path 21/21. V2 downstream re-verified (below).
**ONE PERF CAVEAT (not a fidelity defect, not grade-blocking):** the R4 helper's per-match sentence-boundary walk is
**O(n²)** on a pathological no-terminator input, MEASURED 302→1151→4561→19790ms across 4 doublings (28→57→113→227KB).
Root is NOT regex backtracking — `ELIGIBILITY_BAR_RE` scans LINEAR (1ms at 4000×, isolated); the cost is the
`while (ss>0 && !".!?".includes(...))` sentence expansion (audit-orchestrator.ts:1562-1563) walking the whole string per
match when there is no `.!?` terminator. Requires a single ≥28KB terminator-free sentence with repeated bar tokens — not
a shape real (period-terminated) solicitation prose produces; sub-second at realistic sizes. Flagged, not asserted-away.
Suggested fix: cap the sentence-walk window (e.g. ±N chars) or precompute sentence offsets once. Does not change the pole.

**One-line rationale:** R4 (`7eb7cbb`) closed BOTH R3 over-fires that graded the prior cert C — belt-1's 30-char
adjacency was replaced by `OFFEROR_ELIG_BOUND_RE` DIRECT-BINDING (offeror must be the party immediately bound to the
eligibility verb, not a genitive possessor of a thing), and belt-2's 8(a) branches were re-anchored to a
restriction-verb / program-noun so the FORM_FIELD_8A_RE skip is no longer pre-empted. Every attack surface — genitive-thing
benign prose, form-field 8(a), FAR-reference 8(a), belt-1 possess/hold/maintain benign obligations, multi-bar sections —
resolves correctly, and the under-fire hard-zero (clearance/ITAR/debarment/SAM-registration/real-8(a)-restriction) stays airtight.

## R3 OVER-FIRES — VERIFIED CLOSED by R4 (both were the grade-C blockers)
- **belt-1 adjacency over-fire (§E/§F logistics).** "The firm's samples shall be registered in the tracking log…",
  "Contractor personnel shall be registered in the visitor system.", "The firm's documents shall be registered…",
  "The firm's welds shall be certified…" — all now `covered_direct`. R4 belt-1 (`OFFEROR_ELIG_BOUND_RE`) requires the
  offeror noun to be DIRECTLY bound (offeror+shall/must+verb, or "eligible offeror", or "offeror that is eligible"); a
  genitive possessor of a THING no longer force-floors → falls to THING_LEAD skip.
- **belt-2 8(a)-reverse ordering defect (§D form-field).** "The program described in block 8(a) shall be delivered…",
  "Enter the applicable program identifier in field 8(a)…", "Reference the program element in field 8(a)…", "The
  offeror's program manager shall be identified in item 8(a).", "Only block 8(a) requires an entry.", "Section 8(a) of
  the FAR applies…", "Enter the contract line item in block 8(a)." — all now `covered_direct`. FIRM_CREDENTIAL_RE's 8(a)
  branch is anchored to restrict/limit/reserve/award-to/available-to/open-to/eligible-to/performed-by OR a program noun
  (participant/concern/certified-firm/designation/program-participant/set-aside), so bare program/only/award/field
  co-occurrence no longer pre-empts the form-field skip.

## UNDER-FIRE HARD-ZERO — PRESERVED (0 leaks across all attacks)
Still floor correctly: real §H clearance ("shall possess a Top Secret facility clearance"), ITAR/DDTC registration,
"shall be registered in SAM and not be debarred", real 8(a) restriction ("Award is restricted to 8(a) program
participants only", "Only 8(a) certified firms are eligible for award"), ISO 9001 firm certification/registration,
multi-bar §H (clearance + ITAR both surface, benign grounded finding NOT surfaced), §D benign-8(a)+real-CMMC (CMMC
surfaces, form-field does not). FRESH-ATTACK belt-miss cases ("The successful offeror must be an eligible small
business", "Only an offeror that is an eligible small business may receive award", "The firm's status must be that of
an eligible small business concern") ALL still FLOOR — belt-1/belt-2/THING_LEAD all miss ⇒ no skip granted ⇒ fails
toward escalation (the by-construction under-fire seal held).

## NOT A DEFECT — ratified card #516 self-cert demotion (OUT OF CONTRACT for these R4 seams)
"Award is limited to certified 8(a) concerns." and "This requirement is set aside for 8(a) program participants." resolve
`covered_direct` — but via `isBidderSelfDeterminableSentence` (line 1565, runs BEFORE `isNonBidderEligibilitySentence`
@1566), NOT the R4 predicate. An 8(a) set-aside is a socioeconomic status the firm SELF-CERTIFIES (8(a)⊂small-business,
self-determinable per SBA), deliberately demoted to a self-cert caveat by the previously-DRY-stamped card #516/#534
authority. My initial probe expected these to floor — WRONG expectation, corrected; the demotion is CORRECT and the caveat
still surfaces via the self-cert path. See [[project_setaside_subset_aware_conflict]] / [[project_card516_selfdet_class_shipped_dry]].

## WHY A (not lower)
- Direction SAFE (over-fire → covered→human-review) → no AUTO-F possible on this axis.
- Both prior C-grade over-fires demonstrably closed; 0 new over-fires found across a targeted R4-seam sweep (belt-1
  direct-binding possess/hold/maintain, genitive-thing, ACCEPTANCE frame, belt-2 reorder, multi-bar realism).
- Under-fire hard-zero airtight under every probe.
- flag-OFF byte-identical; ReDoS linear; builder's own 21/21 prod-path suite still green at HEAD.

## Probes (independent, PROD QUARTET armed, real completenessOf, no stubs)
- `scripts/audit-ai/_stamp-covdirect-r3closed.ts` — 13/13: both R3 over-fires closed + under-fire preserved + fresh-attack belt-miss floors.
- `scripts/audit-ai/_stamp-covdirect-overfire.ts` — 14/14: R4 belt over-fire hunt (genitive/accept/8(a)-reorder) + self-cert demotion confirmed + under-fire hard-zero.
- `scripts/audit-ai/_stamp-covdirect-realism.ts` — 12/12: multi-bar §H/§D realism (right sentence surfaces), clean §F, flag-OFF byte-identity, short-input ReDoS.
- `scripts/audit-ai/_stamp-covdirect-v2redos.ts` — 11/12: (A) REAL gradeCoverageV2 over R4 fixtures — over-fire fixtures V2 grade 1.0 / disqualifierUncovered=0, under-fire clearance escalates in V2; (B) 5/6 ReDoS shapes <500ms, the 6th (no-terminator giant) surfaced the O(n²) sentence-walk perf caveat above.
Supersedes [[project_covdirect-finalcert]] (R3 grade C) and [[project_covdirect-drycert]] (R2 grade D).
