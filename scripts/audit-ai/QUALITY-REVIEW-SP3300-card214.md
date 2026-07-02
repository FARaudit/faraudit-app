# RUN-QUALITY REVIEW — SP3300-26-Q-0165 (card-214 paid smoke) · 2026-07-02

CEO asked: the paid runs are cheap (~$1) but how is the **actual quality** of a run verified beyond "it produced a verdict"? This is the answer, executed on the card-214 smoke record (`run-records/SP3300-26-Q-0165-card214-smoke.…json`, $1.089, 40 findings). Three layers: deterministic grounding gate → adversarial 4-lens panel → synthesis.

## LAYER 1 — deterministic grounding/fabrication gate ($0, `verify-run-quality.ts`)
**PASS. 40/40 findings verbatim-grounded (ratio 1.00) — zero fabricated/hallucinated spans.** Every finding's `excerpt` is an exact substring of the source. This is the objective floor; it does NOT trust the engine's `grounded:true` self-report.

## LAYER 2 — adversarial expert panel (4 read-only lenses, row-by-row vs source)
Ex-KO · proposal-manager · pricing-analyst · completeness-adversary. Each read the full 37KB source + all 40 findings and hunted for misclassification + omission.

### What is CORRECT (all lenses agree)
- **Verdict is right:** BID_WITH_CAUTION · eligible=null is doctrinally correct — the only named restriction is the 100% WOSB set-aside (a who-can-win gate); with no bidder profile, eligible=null/verify-caution is right; NO named hard gate forces INELIGIBLE/NO_BID.
- **Pricing/CLINs correct:** both CLINs (0001 Chair Executive ×50, 0002 Chair Task ×300), units, stock numbers, brand-name-or-equal burden all captured accurately.
- **Eligibility classifications sound:** WOSB / NAICS 337214 / size-standard 1,100 / SAM registration all correctly typed as eligibility bars.

### MATERIAL GAPS (cross-corroborated by ≥2 lenses)
| Gap | Sev | Lenses | Source proof |
|---|---|---|---|
| **Quote deadline absent** | HIGH | proposal-mgr + completeness | "Closing Response Date: 6/29/2026, 5:30PM EDT — Failure to submit… may result in non-consideration" |
| **Delivery schedule (30 days ARO) absent** | HIGH | proposal-mgr + completeness | "8. Delivery Schedule: 30 days ARO" |
| **Non-Manufacturer Rule (FAR 52.219-33) absent** | HIGH/MED | ex-KO + pricing + completeness | "52.219-33 Non-Manufacturer Rule" — for a chair reseller the effective size ceiling is 500 employees, not the 1,100 stated |
| **Offeror-completion table (Mfr / Part# / "free to set your own price?") absent** | MED | pricing + proposal-mgr + completeness | source Schedule of Supplies fill-in table per CLIN |
| **SF-1449 block-completion + signature absent** | MED | proposal-mgr + completeness | "OFFEROR TO COMPLETE BLOCKS 12,17,23,24,30" · Block 28 "REQUIRED TO SIGN… AND RETURN" |
| **Mandatory reps/certs (52.212-3, 52.204-7 SAM, Maduro 252.225-7055, Xinjiang 252.225-7059) absent** | MED | ex-KO + completeness | provisions-incorporated-by-reference block |

### ENGINE DEFECT (found by 2 lenses, root-caused deterministically)
**The `procedural_coverage` lens (`AUDIT_PROCEDURAL_COVERAGE_LENS`, flipped prod-ON in card 214) truncates obligations mid-sentence.** It splits on periods, so it cuts at decimals and email addresses:
- `#0` "…hold the prices firm for 30 calendar days from the date specified **for**" (dangling)
- `#3` "…submitted in whole cents (**$1.**" (decimal split)
- `#4` "…via email at: **michael.**" (email split)
- `#12/#13/#14` §M obligations cut mid-clause.
6 of 17 procedural findings are truncated → grounded but not actionable (a coverage-tick, not usable content). **Not a safety defect** (verdict unaffected, nothing fabricated) — a deliverable-quality defect now live in prod.

## SYNTHESIS
The cheap paid run is **verdict-correct and fabrication-free**, but **not yet customer-grade on completeness/formatting**: it misses the two facts a bidder needs first (deadline, delivery), misses the Non-Manufacturer Rule that governs reseller eligibility, and stores §L/§M obligations truncated. 3 of 4 lenses returned MATERIAL ISSUES/GAPS. This is exactly the gap between "the engine works / didn't regress" (shape check) and "this audit is right for a customer" (source-grounded review).

## WHAT WAS BUILT (durable — task 2)
`scripts/audit-ai/verify-run-quality.ts` — $0 deterministic gate, now auto-run at the end of every `paid-run.ts`: (1) grounding/fabrication, (2) truncation detector, (3) key-fact coverage (deadline · delivery · NMR present-in-source-but-not-surfaced). Exits non-zero → "HUMAN REVIEW before customer ship." It is a tripwire floor; the 4-lens panel remains the deep layer for real deliverables.

## OPEN — needs CEO/Brain decision (engine work, NOT auto-done)
1. **Fix the procedural-lens truncation** (sentence-splitter: stop breaking on decimals/abbreviations/emails). Highest-value, isolated, implicates a just-shipped flag.
2. **Add first-class extraction** of quote deadline · delivery schedule · Non-Manufacturer Rule as findings (the administrative/logistics band the capture lens under-covers).
3. **Decide** whether to make the panel review a standing gate on every *customer* audit (not just deterministic tripwire), and whether the truncation warrants any card-214 flag rollback (recommendation: no rollback — quality not safety; fix forward).
