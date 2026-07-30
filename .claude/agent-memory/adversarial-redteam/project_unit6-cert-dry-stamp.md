---
name: unit6-cert-dry-stamp
description: Unit6 applyFindingDedup FINAL DRY certification — CONCUR grade A, verdict-safe-by-construction TRUE after the protected-passthrough pivot
metadata:
  type: project
---

# Unit6 finding-dedup FINAL DRY CERT — CONCUR (A), verdict-safe-by-construction = TRUE

**Terminal ruling of the R1-R4 + judge-tiebreak arc.** The DECISIVE pivot removed all worst-bundle / forced-survivor / disposition-reconstruction / tiebreak logic that produced EVERY prior break in [[project_unit6-judge2-tiebreak-ctrl-mismatch]], [[project_unit6-judge-attr-clobber]], [[project_unit6-r3-requiredattribute-bundle-gap]], [[project_unit6-r2-forced-survivor-disposition-inherit]], [[project_unit6-r1-dedup-marker-strip]].

**New gate contract (`applyFindingDedup`, audit-decide.ts L1849):** only a PLAIN member collapses. plain ≡ `fdBaseAbsorbable` = `!isBarClass(f)` AND every own-key ∈ FD_ABSORBABLE_KEYS (no marker, no requiredAttribute). ANY bar/marker/attr-bearer = PROTECTED → passes through by-reference untouched. Merge fires only on ≥2 plains; survivor = `{...worst}` of plains (itself plain/non-bar/no-attr), severity=max, cautionFloor OR'd, grounded OR'd, facets = maximal+canonical `·`-join.

**Why verdict-safe (independently re-derived):** every deriveVerdict driver is either (a) a bar/marker/attr-bearer = protected/untouched, or (b) OR-monotone (cautionFloor) / rank-monotone (fdKindRank boilerplate=0 floors material-emptiness `every(dropped)`) among plains. `unverifiedGates` guarded by `!!requiredAttribute` → plain never enters (proven even with tristate armed + kind:eligibility_bar plain). `isBarClass` IS the complete verdict-driving controllability set (bidder_cannot_move+no_one_can_move; already_satisfied→met and bidder_controls→gate_to_clear are inert except cautionFloor). logicalShowStoppers/objectIdsOf only see showStoppers=bars=protected → the `·`-joined survivor req never reaches them. knifeEdge runs in verifier BEFORE dedup, not post-dedup verdict path.

**Own probes (scripts/audit-ai/_cert-unit6-*):** invariance (9 scenarios, null/open/closed, idempotent, order, flag-off, ReDoS) ALL PASS; hardgates (2b material-emptiness flips, R1/R3/R4 P0 family now NON-MERGES rows2→2/3→3, over-merge facet-preserve, restatement, disposition parity) ALL PASS; realrecord dccce793 93→78, verdict/eligible/ss invariant all 3 profiles, NO protected absorbed, survivors plain/no-attr, idempotent, order-stable 20 shuffles, flag-off same-ref, ReDoS 8ms; eligbarkind (tristate armed) PASS.

**Only red output = STALE PRE-PIVOT probes:** `_judge2-unit6-tiebreak.ts`(15) + `_judge2-unit6-order-hardening.ts`(1) assert OLD worst-bundle produced a merged survivor with re-derived disposition/attr on requiredAttribute/eligibility_bar seeds — those are now protected non-merges ("no survivor produced" = correct safer behavior); the verdict+eligible invariance in each STILL HOLDS. Post-pivot suites `_judge-unit6-battery`(0 breaks) + `_reprove-unit6-dccce793`(GREEN) are the correct contract. Did NOT edit gate or probes.

Deliverable: ceo/redteam-unit6-cert.md. Supersedes all prior Unit6 dissent entries.
