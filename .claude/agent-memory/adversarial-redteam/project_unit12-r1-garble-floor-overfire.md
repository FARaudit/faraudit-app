---
name: unit12-r1-garble-floor-overfire
description: Unit#12 obligation-garble-floor R1 Gauntlet — F, clean wage/CLIN tables false-INCOMPLETE (density-axis root)
metadata:
  type: project
---

Unit #12 `AUDIT_OBLIGATION_GARBLE_FLOOR` (default-OFF), garble-rejection of the
`read_no_obligation` relief valve at `audit-orchestrator.ts:1581-1595`, discriminator
`looksGarbled` (`pdf-ocr.ts:37-53`). R1 red-team = **grade F**.

**Why:** the discriminator axis (common-English-word density, `COMMON_WORDS_RE`, floor per1k<3)
is fundamentally wrong for the DANGEROUS classes — clean SCA wage tables, compact CLIN price grids,
FAR clause-number lists, acronym-dense DoD prose are all LOW common-word density BY NATURE
(indistinguishable from garble). These have no obligation verbs → the valve path → get floored to
`obligations_ungrounded` → `coverageComplete=false` → `deriveVerdict` returns **INCOMPLETE**
(genuinely-covered section → human review = the cardinal over-fire sin for THIS gate).

**Breaks:** P0 wage table + P0 CLIN grid (both proven end-to-end); P1 clause-list + acronym prose;
P2 flag-coupling (floor correctness depends on INDEPENDENT `AUDIT_TXT_INGEST` — legacy incl-ws
denominator halves columnar density → doubles over-fire; floor gate uses `=== "true"` while
`looksGarbled` uses tolerant `isEnvOn` → parser drift); P3 under-fire (homoglyph/char-substitution
OCR garble keeps enough intact common words to escape at 516 non-ws; `len<300` short-circuit never
floors short garble).

**Production-composition PROVEN (not proxy):** `_rt-unit12-r1-prodpath.ts` drives exported
`completenessOf` → real valve/garble site :1591 → `missing[]` → coverageComplete → real
`deriveVerdict`. Flag-OFF baseline byte-shows `read_no_obligation`/covered=1; flag-ON flips identical
clean text to INCOMPLETE. No coverage logic stubbed; sections on `ctx.sections`, findings=[].

**Fix DIRECTION (not implemented):** floor on POSITIVE mojibake signal (non-ASCII/control-char
density + no clean ASCII word-run + broken word-shape), recognize tabular/numeric structure and fail
toward the valve, decouple density denominator from `AUDIT_TXT_INGEST`, unify flag parser to isEnvOn.

Deliverable `ceo/redteam-unit12-r1.md`. Probes `scripts/audit-ai/_rt-unit12-r1-*.ts`.
Kin to [[project_dccce793-lbj-seq2-adjudicated]] (looksGarbled wage-det history).
