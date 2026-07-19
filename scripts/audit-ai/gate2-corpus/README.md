# Gate-2 Adversarial Corpus — staged, $0, NOT YET RUN

Assembled per card #558 Part 2. **Adversarial to the six units — NOT a dccce793 replay.** Every specimen makes a gate WORK.
Staged alongside the accumulated Phase 2+3+4 diff on `phase2-emission-grounding-548`. **No ultracode fired — CEO front-door only.**

- Manifest: `scripts/audit-ai/gate2-corpus/manifest.json` (64 specimens, 7 rows, each with `origin` real/synthetic + `expected` gate behavior).
- Oracle for Row 1: the ratified `ELIGIBILITY_BAR_RE` (audit-orchestrator.ts:284) — every Row-1 specimen is a PROVEN miss (`reMiss:true`).
- Extractors (rerunnable, $0): `_gate2-extract-row1.ts`, `_gate2-assemble.ts`.

## Specimen count per row
| Row | Unit-metric | Specimens | real | synthetic |
|---|---|---|---|---|
| **R1** | 🔴 ELIGIBILITY_BAR_RE pre-filter miss (LOAD-BEARING) | **31** | 23 | 8 |
| R2 | U4 doc-class / structural-assertion | 7 | 7 | 0 |
| R3 | U5 quantity/LOE ambiguity | 6 | 6 | 0 |
| R4 | U6 finding-dedup (bar-bearing repeats) | 6 | 6 | 0 |
| R5 | #12 garble floor | 6 | 6 | 0 |
| R6 | Phase-4 covered_direct two-belt | 3 | 3 | 0 |
| X | commercial UCF-equivalent (52.212-1≡§L / -2≡§M) | 5 | 5 | 0 |
| | **TOTAL** | **64** | 56 | 8 |

Row 1 got the depth (CEO priority). Real specimens verbatim from the local full-source corpus (stress-sets + gold-sets + oracle-set); synthetics grounded in real DoD/DOE/NISPOM/FAR terms of art, each RE-validated as a true miss.

## Sourcing outcome — where real came up short (report coverage gaps BEFORE spend)
1. **R1 real is SHAPE-matched → needs an expert bar-vs-performance labeling pass before the run.** The 23 real specimens were extracted by token-shape; a few are PERFORMANCE/workmanship reqs that merely share a token ("partitions installed by an authorized installer", "CAC issued based on a favorable check") rather than true bidder-DISQUALIFIERS. Keep the true firm-eligibility bars; drop the performance hits. The 8 synthetics are clean by construction.
2. **R1 shapes with ZERO real hits → filled by synthetic (grounded, RE-validated):** polygraph (CI/full-scope), DOE Q/L access authorization, FCL-abbrev at Secret level, CBA-signatory. The real corpus carried these tokens only in non-bar contexts (wage determinations, references).
3. **R5 garble UNDER-fire side — CLOSED (card #560).** `row5-garble-underfire.json`: a grounded synthetic pair — a real SCA wage-determination/payroll obligation paragraph, clean vs failed-scan (U+FFFD replacement chars where glyphs unresolved, obligation verbs destroyed). Measured both directions: clean=0% hard / no-floor; garbled=11.64% hard (arm A) / floors; both ≥300 non-ws chars. Cert `_build-corpus-gap3-garble.ts`.
4. **R6 covered_direct UNDER-fire side — CLOSED (card #560).** `row6-covered-direct-underfire.json`: 3 dense §C/§H cleared-work SOWs (TS/SCI clearance / FCL / VAR bar) with a benign GROUNDED finding co-resident with an ungrounded passive firm bar. All floor to obligations_ungrounded (escalating the REAL bar sentence, not the benign one) through the REAL `completenessOf()` production path — proving the Phase-4 covered_direct floor + Phase-5 passive detector end-to-end. Cert `_cert-corpus-gap4-cH-underfire.ts`.
5. **Key structural finding — ADDRESSED by Phase 5 (card #560).** `ELIGIBILITY_BAR_RE` catches the "shall/must HOLD a [clearance]" FRAME but MISSES noun-phrase/passive frames ("a TS/SCI clearance IS REQUIRED", "an FCL at the Secret level"). Phase 5's `passiveFrameEligBarSentence` sibling closes this (positive bid-eligibility-consequence gate; Gauntlet-DRY, R1 31/31, 3 red-team rounds 0 clear over-fire).

## Expected-behavior labels
Each specimen carries `expected`. R1: "engine MUST surface as an ungrounded eligibility bar; today INVISIBLE (pre-filter miss) → the catastrophic false-COMPLETE the corpus must expose." R2-R6/X carry the per-gate expected behavior (doc-class no-fire, caution-not-bar, protected-dedup, no-floor-on-clean, belt over/under-fire, commercial section-routing).

## Status (card #560) — ALL PRE-RUN GAPS CLOSED
- ✅ R1 expert bar-vs-performance labeling (manifest: 12 true_bar / 19 performance_skip).
- ✅ Phase 5 built + Gauntlet-DRY (passive/noun-frame detector; R1 31/31, 0 clear over-fire across 3 red-team rounds).
- ✅ R5 garble under-fire specimen (gap #3).
- ✅ R6 covered_direct under-fire specimens (gap #4).

**HOLD.** Diff + corpus staged, run-ready. CEO fires the ONE ultracode on the diff + corpus (front-door only — Code never crosses the seam, card #541).
