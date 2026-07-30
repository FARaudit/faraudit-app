---
name: design-move4-hardbar-floor-review
description: MOVE-4 deterministic hard-bar floor DESIGN review (VERDICT-ARC-DESIGN.md bottom block) — grade D; class-level suppression broken BOTH directions (trapSweep makes floor dead code for clearance/CMMC; benign class-mate suppresses real bar → false-BID); frame regex mass-fires on 7019/7021/52.204-7 boilerplate under CLAUSE_SOURCE_FULLTEXT; shadow-only ruling
metadata:
  type: project
---

# MOVE-4 hard-bar floor — adversarial DESIGN review (2026-07-22)

Reviewed `ceo/VERDICT-ARC-DESIGN.md:68-113` + `audit-grounding-sweep.ts` + decide.ts committal exits (4b:3447 · 5c:3518 · 6:3537), notice gate 3289, temporal 3222-3245/3510-3516. Verdicts: P1 KILL · P2 REVISE · P3 KILL-live/PASS-shadow · P4 REVISE · P5 delivered. Overall D.

## The two structural kills (reusable)
1. **Class-level "already-grounded" suppression is broken BOTH directions.** `boilerplateTrapSweep` grounds a `sweepArchetype: facility_clearance`/`cmmc_nist_800171` bidder_controls finding on ANY class-regex paragraph hit — including the bar paragraph itself. So class-keyed suppression ⇒ floor is DEAD CODE for exactly its NHR classes (a class finding always exists when the bar exists). Looser reading ⇒ a benign §L "no clearance required" class-mate suppresses a real ungrounded §H TS-FCL bar → clean false-BID through step-6. "Seen" ≠ "handled": suppression must be INSTANCE-anchored (excerpt char-span overlap `[s,e)` with the matched sentence) or bar-typed-only. **Check every *Ungrounded-style gate for class-vs-instance suppression conflation.**
2. **CLAUSE_SOURCE_FULLTEXT arming injects possession-frame BOILERPLATE sentences into source** — verified verbatim on acquisition.gov 2026-07-22: 252.204-7019(b) "In order to be considered for award, if the Offeror is required to implement NIST SP 800-171, the Offeror shall have a current assessment (i.e., not more than 3 years old …)"; 252.204-7021(d)(1)(i) (post-CMMC-final-rule text) "Have and maintain for the duration of the contract a current CMMC status at the following CMMC level, or higher" (LEVEL IS A FILL-IN — the machine-checkable artifact for the pivot); 52.204-7(b)(1) (current, post-revision) "An Offeror is required to be registered in SAM when submitting an offer or quotation and at time of award" (52.204-13(c) verified: "The Contractor shall maintain registration in SAM during contract performance and through final payment…" — NO at-offer/award anchor, so it false-fires only if the frame regex accepts "maintain" without strict temporal anchoring; 52.204-7(b)(1) is the anchored guaranteed-fire). Provision boilerplate is WRITTEN in the possession frame; a frame-vocab allowlist fire-gate mass-fires on ~every DoD package. NOTE: my memory carried the PRE-revision 7021/52.204-7 texts — always re-fetch clause text, both interim and final texts frame-match anyway.

## Other break classes confirmed recurring
- Negation laundering (gauntlet-ab R8 class): "Offerors are NOT required to possess an FCL at time of proposal; DD-254 issued at award; Government will sponsor interim FCL" — frame substring matches, meaning inverted. Proposed NHR cap = false-NHR on invite-the-uncleared language.
- Subject-binding relitigation: "personnel must possess SECRET at proposal" = staffing (curable), not firm bar — the whole #557 covered_direct discriminator re-opened by one regex.
- Fire-side closed-world class list has the same residual-leak property as release-side blocklists (FAA Part 145 / NADCAP / DDTC at-offer bars missed; negation-phrased real bars carry no possession verb).
- FORK-5 coherence test: a bare unverified source-regex hit must never carry MORE committal-blocking authority (NHR) than a verified finding is allowed (needs verifiedBy). Default cap BWC.

## Load-bearing analysis (P3)
While the verbatim veto lives, every floor true-positive is already NHR'd by coverageV2-ungrounded-disqualifier (or BWC'd at 5c on mis-type, or INCOMPLETE'd on unfetched doc) ⇒ marginal false-BID protection ≈ 0, false-fire surface large. Ruling: SHADOW-ONLY, log would-have-fired at the 3 committal exits, measure on 64-corpus + replay + gold-set; arm only in the SAME release that retires the veto (flag interlock).

## Single-change recommendation given
Retarget floor = TYPE-CHECK over the trap sweep's own findings (closed-world sweep finding still bidder_controls at a committal exit, excerpt carries the structural artifact) + instance-anchored suppression; detection anchored to machine-checkable artifacts (DD-254 in manifest at RFP · SAM notice-type field for MAC/BOA · completed 7021 fill-in election · §K rep fill-in), never prose frames. Links: [[gauntlet-ab-round3]] [[design-root2-coverage-exists-review]].
