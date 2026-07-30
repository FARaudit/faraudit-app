---
name: gauntlet-ab-built
description: Independent adversarial gauntlet on the BUILT Invariants A+B (feat/instrument-governance-ab, AUDIT_INSTRUMENT_GOVERNANCE) — 9 distinct BREAK classes, 2 false-BID-critical; grade F
metadata:
  type: project
---

# Gauntlet — Invariants A+B as BUILT (branch feat/instrument-governance-ab) · 2026-07-21

Fixture scripts: `/tmp/gauntlet-ab-hostile.ts` (13 rounds) + `/tmp/gauntlet-ab-e2e-cap.ts` (cap-release proof). All calls hit the REAL exports: `applyInstrumentGovernance`, `clauseRootOf`, `classifyDefinitionalSpan`, `gateV2Outcome`, `disposeFinding`, `deriveVerdict`. $0. No prod code touched.

**Provenance gap:** the referenced prior design-attack file `design_ab_invariants_attack.md` DOES NOT EXIST in this memory dir — amendments were verified against the code's own numbered claims (1,3,4,6,7,8,9,10,11) + cyber-cmmc's `design_ab_invariants_review.md` (4 blocking amendments).

## BREAKS (9 classes · 20 failing assertions)

**CRITICAL — false-BID path (Invariant A cap release, proven end-to-end through gateV2Outcome):**
1. **R4 pool-definiendum = vocab blocklist, leaks 5/5 unlisted terms.** "Eligible bidder / Approved manufacturer / Acceptable source / Qualified bidder / Authorized reseller" means-… all classify definitional:true → NHR cap RELEASED on a real pool bar. `audit-gate-v2.ts:164` (DEFN_POOL_DEFINIENDUM_RE enumerates exact phrases). Violates [[feedback_no_blocklist_shape_allowlist_doctrine]] — a RELEASE resting on a vocab list.
2. **R5 consequence-rider regex misses 3/5 forms.** "will not proceed to evaluation", "will be deemed unacceptable", "will not be evaluated" all slip (RE has only shall-not-proceed / will-not-be-considered|awarded / rated-unacceptable). `audit-gate-v2.ts:160`. Subject nouns "proposals/quotes/quotations" dodge the modal+offeror-noun refusal (`:158-159` noun list has only offeror/quoter/bidder/contractor/proposer).

**Wrongful dormancy (tripwire defeats — S3/S5/S7 all breakable):**
3. **R1 S3: BLANK fill-in + template instruction "Insert N/A if not applicable" → DORMANT.** NA_TOKEN_RE runs over the whole excerpt/parsed tail incl. instruction text; no value-position anchoring. `audit-instrument-governance.ts:79,97-103,178`.
4. **R2 S5: heterogeneity is citation-root-scoped only.** Amendment instance carrying "Level 2 (C3PAO)" with citation "Amendment 0001, ¶3" (root in REQUIREMENT only) is invisible to the family → base N/A dormant-izes (b)(2)/(d) while a live L2-C3PAO stands. `:144-147,168-171`.
5. **R3 S7: ASCII OCR degradation beats looksGarbled.** "(C3PAO) / N/A: [ ]" (level cell lost, type token present) and light box-drawing + column-bleed "N/A" both go dormant. looksGarbled is non-ASCII/U+FFFD-only (`:90-94`); code checks LEVEL-without-TYPE (`:180`) but never TYPE-without-LEVEL as an unparseable tell.
6. **R11 S4-guard laundering:** with NO (b)(1) finding at all, a (b)(2) dependent whose requirement references "(b)(1)" is picked AS governing (`findingCarriesSubpart` scans requirement, `:155,106-110`); its conditional sentence "…if (b)(1) is marked N/A…" supplies the token → (c)/(d) dormant. Defeats the amendment-9/S4 "fake-N/A soft match" guard.
7. **R7 companion 7021 by-reference in SOURCE only (no finding) → dormant.** companionPresent scans findings only (`:195-197`); src param in hand, unchecked. Cyber amendment 3 said "7021 detected present ⇒ force conflict escalate" — §I by-reference is the common case.

**Severity misses:**
8. **R8 CUI negation laundering:** `hasCuiSignal` = token && !negation over the WHOLE string — one negated mention anywhere ("does not involve CUI") kills an affirmative 7012 CDI-safeguard flowdown elsewhere → cuiSignal false → verdict BID instead of BWC. `:116-120,215`.
9. **R6 Invariant A "application 2" NOT implemented.** `classifyDefinitionalSpan` has ONE call site (gate-v2:903). No second regex copy (good), but gate-v2:145's claim "callers = gateV2Outcome + applyInstrumentGovernance" is FALSE (governance module never imports it), and the shipped corpus S1 asserts "definition dropped (typing side re-types → dropped downstream)" by testing the PREDICATE only — no dropping code exists. Composition proof: (a)-definition typed bidder_cannot_move, flag ON → disposes "disqualifying" → NHR stands. Corpus claim = hallucinated coverage.

## HOLDS
S3 blank/whitespace/"[ ]"/☐/struck-N̶/̶A̶ (without instruction text) · S7 U+FFFD/mojibake/heavy box-drawing · root grouping (whitespace, U+2011, OCR-spaced digits; 7021/7012 never merge; 7021-finding companion guard fires) · novel "Level 2 (Government)" escalates, never a curable family · dormant never a show-stopper, never downgrades NHR (live FCL bar stands), single-clean-family → BID+note · flag-OFF byte-identity on every hostile fixture (same array ref; gate-v2 filter call-time-gated both directions) · "found nonresponsive"/"rated Unacceptable" refusals.

## Notes (not breaks)
- `curabilityForFillIn` + `CURABILITY_BY_TYPE` + `gov.curability` are DEAD CODE (worstCase hardcoded "curable" on the only dormant path, `:214`). long_lead / ≥2-families / directionAmbiguous demote arms are unreachable from this producer (map has one clause; producer never sets them) — dormantDemotes ≡ cuiSignal in practice. Drift risk: a future S2 path may consult the map believing it's exercised.
- Cyber amendment 2 (S2 on-schema target typing: gate_to_clear + assessment-conditioned caution) explicitly deferred in code (`:182-183` "downstream concern") — an on-schema L1-Self buy with bar-typed deps still lands NHR, the review called this blocking-for-A.
- Flag-predicate split: module default path uses `isEnvOn` ("1"/"yes"/"on" accepted) vs gate-v2/orchestrator `=== "true"` — flag="1" gives gate-v2 OFF / governance-default ON (prod safe only because the orchestrator passes explicit opts).
- `naRawLocatable` tests NA_TOKEN_RE against the ENTIRE source — near-vacuous (any N/A anywhere).
- Cyber review's own kill-list item "204.7504 likely mis-numbered, should be 204.7503" is itself WRONG: clause-titles.generated.json:690 → 204.7504 = "Solicitation provision and contract clause" (the prescription). 204.7503 = Procedures.

## Verdict
GAUNTLET GRADE: **F** — bar was zero incorrect behaviors; 9 defect classes, 2 false-BID-critical (cap release on real pool/consequence bars), all 3 tripwires (S3/S5/S7) defeated by realistic inputs, plus a hallucinated-coverage claim in the shipped corpus (S1 "definition dropped"). Does NOT survive SME challenge. Flag-OFF safety and verdict-ordering ARE solid — the failure surface is entirely flag-ON classification.

Minimal fixes (NOT applied): anchor NA token at the parsed VALUE position + refuse on blank-runs/instruction verbs/assessment-type tokens in the tail; heterogeneity scan over ALL findings' requirement text (or src) for a root-tied level; TYPE-without-LEVEL ⇒ unparseable-escalate; governing pick requires (b)(1) in CITATION; companion check also scans src; positive-shape pool/consequence refusals (definiendum-class + restrictive copula; generic not-(proceed|evaluated|considered|accepted)/deemed-unacceptable) per the shape-allowlist doctrine; implement or retract the typing-layer definitional drop; window-scoped CUI negation.
