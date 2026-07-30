---
name: unit6cf-r3-composite-identity
description: R3 pass — independent-max merging manufactures kind×ctrl composites no member had; structural guards must scan the verdict authority's CALL GRAPH, not just its body; truthy-vs-strict coercion launders off-domain values
metadata:
  type: project
---

Round-3 red-team of `applyCrossFleetDedup`/`applyFindingDedup` (2026-07-20) refuted the "treadmill ended BY CONSTRUCTION" claim with 3 new break classes, all one axis deeper than R2's value-domain holes:

1. **COMPOSITE-IDENTITY (the big one):** the survivor takes ctrl-max and kind-max INDEPENDENTLY, so merging (eligibility_bar × already_satisfied) + (submission × bidder_controls) manufactures an (eligibility_bar × bidder_controls) row that existed on NO member. Any verdict reader that consumes a field PAIR jointly sees a phantom — `selfClearablePackageBars` (card #590, called by deriveVerdict step 4b) keys selfCertBars on exactly that pair ⇒ 270/3888 absorbable-pair verdict flips (BID/true→BWC/null) under AUDIT_SELF_CLEARABLE_PACKAGE=true. This is the SAME desync seam the author's own comments call irreducible for markers ("disposition from `worst`, markers ride from a different primary") — independent-max is whole-member ride-along's mirror image, not its fix.

2. **STALE INERT-CONTRACT:** `FD_VERDICT_INERT_ON_PLAINS.excerpt` ("read only to re-hash verifiedBy") went FALSE when card #590 landed — `hasLongLeadCredential(hayOf(f))` scans excerpt of ALL live findings package-wide. An absorbed member's CMMC excerpt vanishes (survivor keeps only worst's excerpt; facets merge requirement ONLY) ⇒ the long-lead veto silently lifts ⇒ flip.

3. **HOLLOW STRUCTURAL GUARD:** finding-dedup.test.ts scans only 4 function BODIES (deriveVerdict/disposeFinding/firmStatus/nmrFirmStatus). deriveVerdict CALLS selfClearablePackageBars/siteVisitEligStoppers/demoteMmEvidenceFactor — none scanned ⇒ guard printed LEAKS:[] green while my scripts flipped verdicts. A body-scan guard also structurally CANNOT see joint-read pairs.

4. **TRUTHY LAUNDERING:** merge aggregates use `members.some(f => f.cautionFloor)` (truthy) then write LITERAL `true`; deriveVerdict reads `=== true` (strict). Off-domain `cautionFloor:"yes"` (blind-cast model output) is invisible OFF-path, floors ON-path — BID→BWC under DEFAULT env, no extra flag.

**How to apply:** on any merge/dedup review — (a) enumerate every JOINTLY-read field pair in the verdict authority's full CALL GRAPH and demand the survivor's pair come from ONE member or be provably reader-safe; (b) diff every "inert field" doc-list against gates landed SINCE it was written (card-номер drift); (c) grep for `some(f => f.X)`/`?.X ?` aggregations feeding fields readers check with `===`; (d) flag-combination sweeps, not just default env (the default-env sweep was 0/3888 clean while the flag-ON sweep flipped 270). Attack scripts: scripts/audit-ai/_rt-unit6cf-r3-{1..4}.ts. Confirmed-holding: date normalization (4-format unify, no distinct-date collision), facet no-loss (negation/≤≥/zero-width), by-reference protected passthrough incl. clause-survivors, idempotence, flag-OFF same-ref. See [[unit6cf-r2-value-domain-probe]].
