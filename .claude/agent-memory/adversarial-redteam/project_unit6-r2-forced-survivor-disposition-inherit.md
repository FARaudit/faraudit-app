---
name: unit6-r2-forced-survivor-disposition-inherit
description: Unit6 R2 red-team — D; forced-survivor + kind-in-allow-list re-open the cardinal sin (bar softened/dropped); R1's 6 breaks stay closed
metadata:
  type: project
---

Gauntlet Unit 6 R2 on `applyFindingDedup` (flag `AUDIT_FINDING_DEDUP` default-OFF) @ `a6e6431`. Grade **D**. Report `ceo/redteam-unit6-r2.md`. Probes `scripts/audit-ai/_rt-unit6-r2-{attack,root,prodpath,regression}.ts`.

**R1 regression: all 6 CLOSED (0 fail)** — marker-strip P0 (nmrGuard/requiredAttribute/mmEvidenceFactor bearers PROTECTED, outside FD_ABSORBABLE_KEYS), 2-distinct-attr P1, base/first over-merge P2, phone-.555 false-key P2, disjoint-object-id O1. Idempotent/order-stable/flag-OFF same-ref/ReDoS-1ms/real-record invariant (NHR/true→NHR/true, 93→77) all HELD.

**3 NEW P0 (pole-flip), same root:** survivor is `{...primary}` and **controllability/curableInWindow/kind are NEVER re-derived to group-max — inherited from primary.** Header doctrine (audit-decide.ts:1767 "controllability = most disqualifying in group") is FALSE on the forced path.
- P0-1 FORCED SURVIVOR (exactly-1-protected): primary=findings[forced]=the protected member regardless of ctrl. A protected `bidder_controls`/curable member absorbs a plain `no_one_can_move`/non-curable bar → bar vanishes. **PROD-PATH PROVEN**: `applyStructuralBarWhitelist` (flag default-ON `!== "false"`) demotes one same-clause row → `bidder_controls+structuralWhitelistGuard` (marker NOT in allow-list → PROTECTED); sibling raw bar left as-is; dedup (runs LAST, orchestrator P4.6-septies) forces the demoted row as survivor → eats the bar → `NEEDS_HUMAN_REVIEW/true → BID_WITH_CAUTION/true`. Every re-typing sibling guard creates the protected-demoted row.
- P0-2 `kind:"boilerplate"` IN FD_ABSORBABLE_KEYS: `disposeFinding(boilerplate)="dropped"`. Boilerplate becomes primary via length-tiebreak (0-protected) or protective marker (forced) → survivor kind=boilerplate → whole cluster's decision content dropped → "materially-empty verified set" guard (line 2961) fires → `BID_WITH_CAUTION/true → NEEDS_HUMAN_REVIEW/false`, or a real bar lost. **Real record**: 4 boilerplate findings, 3/9 multi-member clause groups have a boilerplate member, 2 groups mixed-controllability — not contrived.

**P2/P3 (safe direction / non-verdict):** P2 fdIsRestatement tests cand⊆CONCAT(acc) as acc GROWS → a distinct facet whose tokens scatter across earlier facets is swallowed ("submit pricing references" ⊆ f1∪f2); fix=pairwise containment vs each single prior facet. P3 `.2\d{2}` misses DFARS `.70xx` (252.7003-1/7012/7000) + FAR 52.1xx/52.3xx → whole DFARS supplement no-ops (under-merge=safe). P3 grounded/unverified COUNTS drop on absorb (telemetry only).

**SINGLE FIX for both P0s:** never inherit disposition from primary; re-derive `controllability`/`curableInWindow`/`kind` to group-most-conservative on EVERY path (forced+plain); forced/protected member contributes ONLY markers. Restores the header's own invariant the forced path violates.
