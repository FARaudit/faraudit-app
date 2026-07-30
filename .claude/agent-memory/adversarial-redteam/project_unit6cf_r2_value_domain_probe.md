---
name: unit6cf-r2-value-domain-probe
description: R2 pass on the dedup gates — field-level structural guards miss VALUE-domain holes; always probe off-enum values at pure-gate boundaries
metadata:
  type: project
---

Round-2 red-team of `applyCrossFleetDedup`/`applyFindingDedup` (2026-07-20) found the fresh P1 in the VALUE domain, not the field domain: an off-enum/undefined `controllability` is `fdBaseAbsorbable` (isBarClass is a 2-string blocklist) yet `disposeFinding` maps it to "disqualifying" (5a fail-closed NHR), and `fdCtrlRank` ranks it 0 = least conservative → absorbed → NHR flips to BID.

**Why:** the Brain #555 structural-completeness guard (finding-dedup.test.ts) proves every verdict-read FIELD is preserved/protected/inert — it cannot see that "most-conservative controllability" is false outside the 4-value enum. Model output reaches the gates through a blind cast (`f as RawFinding[]`, audit-expert.ts:285; verbatim copy :116) with zero runtime enum enforcement, so the engine's runtime envelope is wider than the TS types.

**How to apply:** on any future gate review, after the field-completeness check, ALWAYS probe: (a) off-enum values for every enum field the gate ranks/sorts (rank-fallback `?? 0` next to a fall-through `default: severe` = the tell of a rank/disposition inversion); (b) purely-symbolic distinguishers the tokenizer erases (≤/≥, ±, unicode numerals) for any token-set restatement test; (c) exhaustive enum-valid pair sweeps ON-vs-OFF (110k cases ran in seconds — cheap). Attack scripts: scripts/audit-ai/_rt-unit6cf-r2-{1..4}.ts.
