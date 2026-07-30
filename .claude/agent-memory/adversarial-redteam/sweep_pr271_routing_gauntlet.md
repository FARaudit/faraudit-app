---
name: sweep-pr271-routing-gauntlet
description: Retroactive gauntlet on ARMED AUDIT_COMMERCIAL_ROUTING_V2 (PR #271) — flag-combo starvation hole is the LIVE worker combo (INTEGRITY unset, worker-verified); §L V2 anchors still mid-content fragmenters; head-drop silent; strict-parse divergence live
metadata:
  type: project
---

Retroactive $0 gauntlet (2026-07-21) on the LIVE-ARMED #525 routing fix, verifying the three claims in [[routing-v2-predicate-reader-divergence]] against origin/main (`277260d`) + the deployed worker env.

## Claim verdicts (deployed proof)
1. **Predicate/reader divergence — FAIL, LIVE, and it is the ARMED COMBO.** `commercialRoutingSafe` reads `LENS_SECTIONS_COMMERCIAL` unconditionally (src/lib/panel-adapter.ts:26); the reader `lensAssignedSections` serves that map only when `isEnvOn(AUDIT_LENS_EMISSION_INTEGRITY) && docClass==="commercial"` (src/lib/agentic-sections.ts:74-75), else the UCF map (proposal_compliance [H,I]). **Worker-verified via `railway variables --service audit-worker`: `AUDIT_COMMERCIAL_ROUTING_V2=true` present, NO `AUDIT_LENS*` var exists (90 AUDIT_ flags dumped) ⇒ INTEGRITY=OFF live.** Fixture R1 (plausible RFQ, no clauses block): placedKeys=[B,C,L,M], predicate SAFE=true, buildPanelInputs routes fallback:none, proposal_compliance gets **0 chars** (UCF map [H,I], neither placed). INTEGRITY=on would feed it 115 chars. The N0016726Q1089 fire log (B:2826,I:1294,L:26351,M:14345,C:27700 fallback:none) proves dormancy for THAT package only — §I placed, so UCF-map [H,I] was fed; any commercial package lacking a §I anchor trips the hole. Fix shape: predicate must evaluate the EFFECTIVE map (call `lensAssignedSections(lens,"commercial")`), not the intended one.
2. **Banned anchor vocab — PARTIALLY REMEDIATED.** Bare `\bCLIN\b`/`line items?`/`technically acceptable` removed pre-merge by `ea3684d` (ancestor of merge `ff1ca18`): §B now header-like `contract line items?\s+(?:number|schedule)` (panel-doc-class.ts:91), §M full-LPTA-phrase only (:87). **BUT the defect CLASS survives in the V2 §L anchor (:85)**: `offerors? shall (submit|furnish|provide)`, `(shall|must) (provide|furnish|submit)…(offer|quote|proposal)`, `\bvolume [ivx1-9][:\-.]`, plus base `section l\b` — all mid-content-capable. Fixtures: R2a mid-§C "offerors shall provide" relabels the PWS tail as §L; R2d mid-§C "Volume 3:" fragments §C; R3a mid-sentence "in Section L of this RFQ" fragments §C. Predicate blesses each mis-slice (placement ≠ fidelity). Consequence bites hardest under INTEGRITY=on (pricing owns C,I but not L → relabeled tail lost).
3. **Strict `=== "true"` — FAIL, live at panel-adapter.ts:106**, violating env-flags.ts single-source doctrine. Dormant only because the worker value is exactly lowercase `true`. Fixture R5: value `"TRUE"` silently disables V2 (whole-source fallback) while `"true"` slices.

## New breaks
- **R4 HEAD-DROP (new, silent).** routeCommercialSections slices from the FIRST anchor hit (panel-doc-class.ts:113-114); cover text before it is dropped from every slice. A declarative set-aside statement ("This procurement is a 100 percent set-aside for small business concerns under NAICS 561210") has no BINDING_LINE_RE verb (panel-adapter.ts:57) so `unroutedBinding` misses it too — smallbiz lens goes blind to the set-aside with zero surfaced signal. Fixture-proven end-to-end through buildPanelInputs.

Fixture file: `scripts/audit-ai/_redteam-pr271-routing-gauntlet.ts` (9 BREAKs). Gauntlet grade **F — not DRY**: the armed flag combo carries an active false-safety certification (P0), plus P1 fragmenters/head-drop and a P2 parse divergence. Defects to be CARDED, not silently fixed.

**Why:** fourth confirmed payoff of the flag-combo sweep + effective-config doctrine; first instance where the hole combo was proven to be the CURRENTLY DEPLOYED combo (repo registry had no INTEGRITY entry — only a live env dump settled it).
**How to apply:** when a predicate certifies a property "under flag X," always dump the DEPLOYED env for X's siblings before calling the hole theoretical; a clean fire log proves dormancy only for that package's placed-key set, never safety.
