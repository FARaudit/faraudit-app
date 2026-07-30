---
name: covdirect-r1-findings
description: Red-team R1 attack on AUDIT_COVERED_DIRECT_BAR_FLOOR (covered_direct hard-bar floor, commit ad14503). Grade C — 0 P0 under-fire (catastrophic direction SOLID), 2 surviving P1 over-fires (§E acceptance-eligibility about goods · §D 8(a) form-block) proven e2e through the FULL prod flag set.
metadata:
  type: project
---

# AUDIT_COVERED_DIRECT_BAR_FLOOR — Red-Team R1 (branch phase2-emission-grounding-548, commit ad14503)

**VERDICT: Grade C / NOT-DRY.** No catastrophic false-green (the direction that matters most is airtight),
but 2 surviving P1 crying-wolf OVER-FIRES proven end-to-end through the REAL prod flag set. Ship-blocking for a
crying-wolf-sensitive engine (over-fire = the cardinal sin per the quantity-ambiguity doctrine), fixable without
touching the under-fire guarantee.

## CRITICAL METHOD CORRECTION the cert missed
`scripts/audit-ai/_cert-covdirect-prodpath.ts` ran with the two self-cert demotion flags **OFF**
(`AUDIT_SELF_DETERMINABLE_ELIG_CLASS`, `AUDIT_SIZE_STANDARD_SELF_CERT`). Those are **ARMED in production**
(worker in-container verified, cards #511/#516/#519), as is `AUDIT_AMBIGUOUS_SIGNAL_DEMOTION=true` (card #506).
So the cert NEVER exercised `isSelfCertDemotableSentence`'s real demotion, and never exercised the V2 belt that
decides escalate-vs-absorb. My probes set the TRUE prod quartet:
`AUDIT_COVERED_DIRECT_BAR_FLOOR · AUDIT_SELF_DETERMINABLE_ELIG_CLASS · AUDIT_SIZE_STANDARD_SELF_CERT · AUDIT_AMBIGUOUS_SIGNAL_DEMOTION`.
**Any re-cert MUST run this quartet or it proves nothing about prod behavior.**

## UNDER-FIRE (catastrophic false-green) — 0 breaks, SOLID BY CONSTRUCTION
- 7 real firm-only bars (verb-less clearance header, restricted-to-cleared, third-party CMMC/C3PAO, HUBZone-cert-from-SBA,
  ITAR/DDTC registration, split-across-sentences, bare CMMC token) ALL correctly floor → obligations_ungrounded → escalate.
  Probe `_rt-covdirect-underfire.ts` (0/7 slip).
- Demotion predicate does NOT wrongly demote any real firm-only bar: set-aside+required-cert and set-aside+external-gate
  correctly ESCALATE; only genuinely self-determinable set-asides (WOSB/8(a)/total-SB/size-standard) demote (CORRECT by
  card #516 ruling). Probe `_rt-covdirect-underfire2.ts` part (I).
- GROUNDING-OVERLAP MASKING (the named P0 vector) is NOT exploitable: the global-scan-every-match design defends it —
  a benign excerpt can only mask the bar match it literally overlaps; any second bar-match in the same sentence still
  floors. The only "masked" case is a finding that quotes the WHOLE bar verbatim, which means the panel analyzed it and
  the verdict correctly rides that finding's own controllability (= cert case D, defensible). Probe `_rt-covdirect-mask.ts`.

## OVER-FIRE (crying-wolf false-INCOMPLETE/NHR) — 2 surviving P1, proven e2e
The floor scans the FULL §B/C/D/E/F/H text with the same `ELIGIBILITY_BAR_RE` the ratified notice-body floor uses, but
over a MUCH larger + prose-denser surface (§C SOW / §E acceptance) where incidental token collocations live densely.
With `AUDIT_AMBIGUOUS_SIGNAL_DEMOTION=true` (prod), the ambiguous+bar-signal-NEGATIVE cases are ABSORBED
(ISO-9001 process spec, Top-Secret data-classification → ungroundedNonBarSignal, cosmetic ledger only). But two classes
carry BAR_SIGNAL-positive or DISQUALIFIER and ESCALATE to NHR:

**P1-A (STRONGEST, realistic) — §E acceptance-eligibility about GOODS.** Standard §E Inspection & Acceptance language:
"Supplies not conforming to the specification are not eligible for acceptance and may be rejected." / "Deliverables are
not eligible for final acceptance until discrepancies are resolved." The `\beligib` / `\bineligible\b` token is in
BAR_SIGNAL_RE → hasBarSignal=true → ambiguous escalates (or disqualifier via "rejected"). §E that read covered_direct on
one grounded finding now floors → disqualifierUncovered → NHR. Proven e2e (completenessOf→gradeCoverageV2, grade 0.50,
disqualifierUncovered on §E = true). Probe `_rt-covdirect-e-realism.ts`. This is routine §E boilerplate → high real hit rate.

**P1-B — §D/§B "block 8(a)" form-block reference.** "Enter the value in block 8(a) of the inspection form." matches the
bare `\b8\s?\(?a\)?\b` branch → BAR_SIGNAL-positive → escalates to NHR. Less common than P1-A but a real §D/form pattern.
Probe `_rt-covdirect-v2loop.ts`.

Root cause (both): `ELIGIBILITY_BAR_RE`'s bare-token branches (`\beligib(le|ility)\b`, `\bineligible\b`, `\b8\s?\(?a\)?\b`,
`\btop secret\b`, `\biso\s?9001\b`) fire on the SUBJECT being a good/deliverable/form-field, not the bidder. The
sentence-precise + self-cert-demote reducer does not distinguish "the OFFEROR is (in)eligible" from "the GOODS are
(in)eligible for acceptance". On the short notice body this is rare; on full §E/§C text it is common.

## Suggested fix direction (not my call to build)
A subject-scoped guard for the acceptance-eligibility class: demote/skip a bar match whose eligibility subject is a
good/deliverable/work-product/form-field (not offeror/firm/concern), OR exclude §E acceptance-context "eligible for
acceptance/payment" from the bare-eligib branch. Do NOT widen by blocklist (doctrine [[feedback_no_blocklist_shape_allowlist_doctrine]]);
use the offeror-as-subject SHAPE the demotion predicate already models. Preserve the airtight under-fire behavior.

## Probes (all under scripts/audit-ai/, all set the prod quartet)
- `_rt-covdirect-overfire.ts` / `_rt-covdirect-overfire2.ts` — over-fire hunt (5 raw firings; overfire2 = different-sentence shape)
- `_rt-covdirect-underfire.ts` / `_rt-covdirect-underfire2.ts` — 0/7 slip + demotion-predicate + masking probes
- `_rt-covdirect-v2loop.ts` — FULL prod-quartet completenessOf→gradeCoverageV2 loop (the decisive escalate-vs-absorb split)
- `_rt-covdirect-e-realism.ts` — the strongest P1 (§E acceptance-eligibility) e2e
- `_rt-covdirect-mask.ts` — grounding-overlap masking (not exploitable)
- `_rt-covdirect-scope-compare.ts` — same regex as ratified notice-body floor; the NEW risk is SCOPE (6 full sections vs 1 notice body)
