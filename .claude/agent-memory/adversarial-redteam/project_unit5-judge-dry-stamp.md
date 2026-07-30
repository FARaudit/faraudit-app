---
name: unit5-judge-dry-stamp
description: Unit 5 quantity-ambiguity fidelity gate — INDEPENDENT JUDGE CONCUR grade A/DRY, terminal stamp of R1-R11 arc
metadata:
  type: project
---

Phase 3 Unit 5 QUANTITY-AMBIGUITY FIDELITY GATE — independent judge (B3 gen/judge split) ruled **CONCUR grade A / DRY** @ `a6e6431`. Written to `ceo/redteam-unit5-judge.md`. Terminal state of the R1-R11 generator arc (r1-r5 F over-fires → r6-r10 P1 → r11 A/CONVERGENCE, see [[unit5-r11-convergence-stamp]]).

**Why:** STAMP/verification round (Bench Protocol B1/B3) — judge did NOT author the R1-R11 probes; reproduced everything from own probes `scripts/audit-ai/_judge-unit5-*.ts` importing `src/lib/audit-decide`.

**How to apply:** Gate = `qaEnclosingQuestion`/`detectQuantityAmbiguities`/`applyQuantityAmbiguityFidelity` (audit-decide.ts:1475-1732), wired P4.6-sexies (orchestrator:2236), flag `AUDIT_QUANTITY_AMBIGUITY_FIDELITY` default-OFF. Independently reproduced live:
- suite 140/0, reprove GREEN, `tsc --noEmit` exit 0.
- Real dccce793 record (`/tmp/seq2-runrecord.json`, `rec.input.fullSource`): fires EXACTLY ONCE on verbatim `"Is the total requirement 520 hours\nor 1,040 hours?"` (span crosses a newline — real Q&A wrap, still grounded); ON adds 1 (93→94), OFF same-ref, all 93 prior findings same object refs (non-destructive — laundered #3 NOT mutated), idempotent.
- Verdict-safe: `disposeFinding`@2258 → bidder_controls yields `gate_to_clear`; disqualifying branch reachable ONLY from bidder_cannot_move which this emitter never sets. cautionFloor:true. Never NHR/NO_BID/INELIGIBLE.
- Dedup dangerous direction CLEAN (7/7): 5W520/52.219-1040 embedded digits, unrelated or-?, one-number, both-no-marker, split-findings ALL still emit; only a genuine prior with both numbers + ambiguity marker in ONE blob suppresses (correct no-double).
- Over-fire: 14 benign + 10 hardest elided-`that` = 0 over-fire. Sole survivor = generator's flagged P3 contrived `"Is the assumption staff bill 520..."` (elided that + uninflected base verb + bare-plural 2nd subj, near-ungrammatical) — fails SAFE (additive caution). Documented SAFE under-fire: `"Are the requirements 3 FTEs..."` (plural `-s` subject trips morphology clause — R8's fail-toward-keep trade).
- Doctrine: positive-shape allowlist (novel unit `pallets` silent, enumerated `copies` fires), NOT a bar-vocab blocklist. Flag-OFF byte-identical (same ref). ReDoS 1-2ms on 50k pathological inputs.

Emitter cardinal sin = crying wolf (flip clean BID→BWC); more-dangerous = false dedup-suppression toward committal. Both closed. Supersedes generator [[unit5-r11-convergence-stamp]] as the ratified terminal ruling.
