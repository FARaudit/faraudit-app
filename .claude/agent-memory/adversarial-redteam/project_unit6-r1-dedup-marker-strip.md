---
name: unit6-r1-dedup-marker-strip
description: Phase 3 Unit 6 applyFindingDedup Gauntlet R1 = grade D; P0 NO_BID pole flip via {...primary} marker strip
metadata:
  type: project
---

Phase 3 Unit 6 `applyFindingDedup` (audit-decide.ts:1805, flag AUDIT_FINDING_DEDUP default-OFF, wired P4.6-septies before deriveVerdict). Gauntlet R1 = **grade D** (report `ceo/redteam-unit6-r1.md`, probes `scripts/audit-ai/_rt-unit6-r1-*.ts`).

**Why:** the gate's named verdict-safety invariant is FALSE. Survivor is built `{...primary, <disposition fields>}` — it re-merges ONLY controllability/severity/curableInWindow/cautionFloor/grounded, but deriveVerdict ALSO reads `universalDefect`/`verifiedBy`/`requiredAttribute`/`nmrGuard`/`mmEvidenceFactor` which can live on a NON-primary member and are destroyed by `{...primary}`.

**Breaks:**
- P0 (verified pole flip): verified universalDefect (registered verifierId + matching excerptHash, FOURWALLS on) on same clause as a higher-severity/longer non-defect finding → non-defect wins primary sort (ctrl tie→sev→len) → survivor drops universalDefect/verifiedBy → `deriveVerdict` NO_BID→NEEDS_HUMAN_REVIEW. Proven live `_rt-unit6-r1-nobid.ts`. Dormant today only because no producer emits verifiedBy yet.
- P1: two DISTINCT proven-fail requiredAttributes same clause → survivor keeps only primary's → INELIGIBLE reason drops attr-beta (no facet-append rescue for requiredAttribute; only `requirement` text is appended). Same halves the tristate "ELIGIBILITY NOT VERIFIED — confirm <gates>" list.
- P2 over-merge: fdIsRestatement ≥0.8 in ≥4-char token space discards short/numeric distinguishing tokens (year/option#/"FIRST"/CLIN) → genuinely distinct same-clause obligation dropped not appended.
- P2 phone collision: FD_CLAUSE_RE `[0-9]{3}\.\d{3}-\d{1,4}` matches `252.555-1212` phone / any NNN.NNN-N numeric → fuses two UNRELATED findings (a bar + a benign inquiry). No clause-context anchor.
- P3: nmrGuard/mmEvidenceFactor/temporalEvidence non-primary drop degrades customer reason (NMR cure path lost) — same {...primary} root.
- P3 doc-inaccuracy: header claims logicalShowStopperCount unchanged; it clusters by objectIdsOf not clause key → distinct-object same-clause bars 2→1.

**Held:** all named regex collisions (17.207/121.406(b)/CLIN/version-year/dot-not-hyphen/5-digit-suffix correctly NOT keyed), no ReDoS (0-1ms/200k), excerpt-only not keyed, flag-OFF same-ref, idempotent, order-stable, real seq-2 93 findings verdict-safe 93→77 (52.219-33 NMR bar kept, 52.217-8 P0 kept).

**How to apply:** remediation = UNION verdict-load-bearing markers across the group (not inherit primary only), OR fail-toward-keep (don't collapse two members carrying different verdict-controlling markers/attrs). Fix marker-union (P0/P1/P3) BEFORE arming. Then clause-context anchor + phone-shape exclusion on FD_CLAUSE_RE (P2), and restatement test that preserves short/numeric distinguishing tokens (P2). Continues the Phase 3 Unit arc after [[project_unit5-judge-dry-stamp]].
