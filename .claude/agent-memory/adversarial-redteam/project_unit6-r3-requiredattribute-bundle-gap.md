---
name: unit6-r3-requiredattribute-bundle-gap
description: Unit6 R3 dedup — NEW P0; R2 re-derived ctrl/kind/curable to worst but NOT requiredAttribute (4th disposition axis) → survivor pairs worst.ctrl + primary.attr = fabricated typed bar from an untyped one, pole moves both ways
metadata:
  type: project
---

Unit6 R3 (`applyFindingDedup`, flag AUDIT_FINDING_DEDUP, @a6e6431) = **F/AUTO-F**, 1 NEW P0 + 2 P2. R1(6) + R2(3P0/1P2/2P3) all CONFIRMED closed.

**P0-1 root (shape-level):** `requiredAttribute` is a 4th disposition-DETERMINING axis (`deriveVerdict` reads it in `firmStatus`, the step-5a `untyped` filter, and tristate `unverifiedGates`) but the R2 "coherent bundle" re-derivation only re-took `controllability`+`kind`+`curableInWindow` from `worst`. `requiredAttribute` still rides from `{...primary}`. So a PROTECTED primary (protected because `requiredAttribute` ∉ FD_ABSORBABLE_KEYS — mmEvidenceFactor NOT required, plain attr member alone breaks it, variant A) that is a caution/curable/already-satisfied member (marker base but NOT worst) + a plain BAR member with NO requiredAttribute (the `worst`) → survivor = `{worst.ctrl=bidder_cannot_move, worst.curable=false, primary.attr=setaside:sb}` — a `{ctrl,attr}` pair NO real member held. The plain bar alone was UNTYPED (`!requiredAttribute` → step-5a fail-CLOSED to NHR under every profile); the fabricated attribute makes it a TYPED bar resolved against the profile: satisfies→BID_WITH_CAUTION/true (false-clear, concern DROPPED), fails(cw+grounded-src)→INELIGIBLE/false (FABRICATED hard bar). Pole moves BOTH directions. Null + open-world-empty are SAFE (fabricated attr → firmStatus unknown → same NHR); any PROFILED customer (cw/gold + ow-capability-statement) hits it.

Real-record 93 invariant HELD (5 profiles) only because 52.219-33's attributed member #92 is ALSO the worst (nmr bar) → attr+disposition coincide. Break needs roles REVERSED = the live 52.219-14 mixed-eligibility_bar shape (#10 ctrl/elig_bar, #89 already_satisfied/elig_bar, #91 ctrl/other) where the two paraphrasing panels disagree on whether to attach an attribute — realistic 2-panel disagreement, NOT contrived.

**Fix direction:** put `requiredAttribute` in the SAME re-derived bundle as ctrl/kind/curable (all four from group-worst), OR extend `fdMergeCompatible` to block `{attr-present}` vs `{bar, attr-absent}` (today only blocks two DIFFERENT non-empty attrs — variant C held), OR drop the inherited attr when worst has none (fail-closed = conservative). Invariant: survivor `{ctrl,curable,kind,requiredAttribute}` must ALL come from one real member (the worst).

**P2-1:** 1–2 char CLIN/option/section distinguisher STILL dropped (`fdNormTokens` ≥3-char) — "option 1"/"option 2" → survivor shows only "option 1"; "Sec A"/"Sec B" → only "Sec A". Task hunt#4 exactly. Facet/display fidelity loss, not verdict-moving (both controllable). **P2-2:** survivor facet CONCAT is order-dependent (fwd vs reversed input → different facet set/order) though anchor index is stable — header's "Order-stable" true only of index+disposition, not rendered requirement.

**HELD:** verifiedBy excerptHash survives (excerpt rides unchanged; requirement rewrite doesn't touch hash input; also inert in prod, empty allowlist), fdMergeCompatible differing-attr block, idempotent, flag-OFF same-ref, ReDoS 0ms, 52.1xx out-of-scope correct. Probes `_rt-unit6-r3-*.ts`. Deliverable ceo/redteam-unit6-r3.md. Continues [[project_unit6-r2-forced-survivor-disposition-inherit]] arc — R2 fixed 3 disposition axes, this is the 4th it missed.
