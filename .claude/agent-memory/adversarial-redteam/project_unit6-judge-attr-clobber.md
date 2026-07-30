---
name: unit6-judge-attr-clobber
description: Unit6 JUDGE DISSENT grade D — R4-certified "verdict-safe by construction" is FALSE; forced-protected survivor's OWN requiredAttribute clobbered to plain worst's undefined → unverifiedGates clamp lost → eligible null→true
metadata:
  type: project
---

Unit6 JUDGE (independent, `applyFindingDedup` @a6e6431) = **DISSENT / grade D / 1 NEW P0**. Fresh eyes broke the R4 "bars-never-absorbed ⇒ verdict-invariant by construction" claim. **verdict-safe by construction: FALSE.**

**P0 (attr clobber, eligible-field flip):** forced-protected survivor (1-protected merge, `primary=forced`) carries a REAL `requiredAttribute` (protected because attr ∉ FD_ABSORBABLE_KEYS), but line 1943 `requiredAttribute: worst.requiredAttribute` unconditionally clobbers it to the group-`worst`'s value. When worst is a PLAIN no-attr `eligibility_bar` with `curableInWindow:false` (outranks the protected primary's `true` on curability tiebreak L1919), survivor attr → **undefined** → drops out of `deriveVerdict`'s `unverifiedGates` filter (`kind==="eligibility_bar" && !!requiredAttribute && !mmEvidenceFactor && firmStatus!=="satisfies"`) → `committalEligible()` returns true not null → **ELIG null→true** (FALSE eligibility clear; verdict word stays BID_WITH_CAUTION via OR'd cautionFloor). Fires null + ow-empty; deterministic 3/3. Minimal 2-member repro (52.219-14). Needs AUDIT_ELIGIBLE_TRISTATE (LIVE prod flag).

**Root:** R3 moved attr into the worst bundle to kill the FABRICATION direction (untyped bar + donated attr → typed bar). This is the INVERSE: primary-has-attr, worst-has-NONE → the protected member's OWN eligibility attribute is silently DROPPED. Opposite pole from R3.

**Why R4 missed it (its own probe note `_rt-unit6-r4-forced-vs-worst.ts:57`):** "attr lives ONLY on protected members => worst.requiredAttribute nonempty => worst protected => forced primary" — BACKWARDS. Proves worst-has-attr⇒protected, never checks primary-has-attr + worst-none. R4 tested mmEvidenceFactor-primary (EXCLUDED from clamp → no flip) but never requiredAttribute-primary vs plain eligibility_bar worst.

**Prod reachability:** LATENT but real. dedup runs LAST @2329 after applySetAsideFirmStatusGate @2096 (enabled by tristate) which re-types null-profile set-aside eligibility_bar → bidder_controls+cautionFloor PRESERVING requiredAttribute = manufactures the forced-protected attributed member. Break needs a same-clause plain no-attr eligibility_bar cw:false from the OTHER panel = the documented 52.219-14 mixed-group (#10/#89/#91) panel-disagreement (memory unit6-r3 "reversed roles" shape). Real-93 HELD only because the sole clause-keyed attributed finding is the 52.219-33 NMR **bar** #92 = itself the worst → attr+disposition coincide.

**Fix:** `requiredAttribute: worst.requiredAttribute ?? findings[forced]?.requiredAttribute` (fallback to forced primary's OWN attr) OR attr rides from forced member always, only ctrl/kind/curable group-conservative from worst. Does NOT reopen R3 (bars never absorbed; fallback restores a real member's real field, no cross-product).

**HELD (all CLOSED):** R1 marker-strip (all verdict markers ∉ absorbable → protected), phone key, distinct-attr block, object-id; R2 forced-demote softening bar + boilerplate primary; R3 attr fabrication; R4 nmr/mm desync; mmEvidenceFactor+cautionFloor(incl. absorbed loser) preserved; idempotent; order-stable (verdict+facet string); flag-OFF same-ref; ReDoS 0ms; empty/null no-throw; REAL-RECORD 93→77 verdict+eligible invariant across 5 profiles (null→cw-gold). Probes `_judge-unit6-{markers,disposition,realmerge,forcedattr,forcedattr2,battery}.ts`. Deliverable ceo/redteam-unit6-judge.md. Continues [[project_unit6-r3-requiredattribute-bundle-gap]] — R3 fixed one attr direction, this is the inverse it created.
