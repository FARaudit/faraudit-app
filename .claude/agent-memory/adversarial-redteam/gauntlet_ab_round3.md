---
name: gauntlet-ab-round3
description: THIRD gauntlet on the positive-invariant PIVOT of Invariants A+B — round-2 N-classes mostly CLOSED, but 12 breaks; 2 CRITICAL families both e2e NHR→BID (P1 last-assignment parser hijack = NEW pivot seam; N7 pool-noun vocab = pivot spec item NOT implemented); grade F
metadata:
  type: project
---

# Gauntlet round 3 — Invariants A+B positive-invariant pivot (feat/instrument-governance-ab) · 2026-07-21

Fixtures: `/tmp/gauntlet-ab-round3.ts` (+ re-runs of `/tmp/gauntlet-ab-round2.ts`, `-round2b.ts`, `-hostile.ts`, `-e2e-cap.ts`); real exports; $0; no prod code touched. Shipped unit suite (`audit-instrument-governance.test.ts`) = ALL PASS — **blind to every break below**.

## PART 1 — round-2 classes on exact re-run
CLOSED: N1 instruction-N/A · N2 OCR-glyph XOR · N3 range-cite governing · N5 mis-grounded excerpt (P5 attr guard) · N6 unquoted "means" consequence (+e2e cap kept) · N9 DD-254/cuiSignal (BWC) · N10 U+2212 companion. All 6 round-2b verdict-flip compositions now NHR both flag states.
RESIDUAL (documented, accepted): **N4 amendment-in-prose** — still dormant-izes under a live C3PAO amendment (code lines ~245-250 document it; wrongful-dormancy direction).
**NOT CLOSED: N7** — N4 is NOT the only residual. The pivot spec item "pool-class by adjective-SHAPE × ANY noun" was never implemented; `DEFN_POOL_DEFINIENDUM_RE` still enumerates nouns (source|manufacturer|bidder|offeror|reseller|distributor|dealer|supplier|product|vendor|firm|contractor).

## PART 2 — 12 breaks, 2 CRITICAL families (both proven e2e NHR→BID via deriveVerdict)

**CRITICAL 1 — NEW pivot seam: parseFillInValue LAST-assignment hijack (P2-1, ×3 + e2e + P2-7a).**
The pivot routed onSchema + heterogeneity + NA-equality ALL onto ONE parsed value — and the parser takes the LAST "is:/reads:" assignment in the excerpt. A governing excerpt containing the adjacent (b)(2) UID row — the canonical 7025 fill-in TABLE shape — parses to "N/A" while (b)(1) elected Level 2 (C3PAO): `"(b)(1) CMMC level required is: Level 2 (C3PAO). (b)(2) The CMMC UID is: N/A."` → parsed "N/A" → deps dormant → OFF=NHR → **ON=BID**. Same for newline-split table rows and `"Justification for N/A, if elected, is: not applicable"` (parses "not applicable" = exact token). The election is invisible to heterogeneity because it parses the SAME excerpt with the SAME parser. Lesson: **collapsing all guards onto one parsed value makes the parser the single point of failure — the greedy line-anchor heuristic is now the whole security boundary.**

**CRITICAL 2 — carried N7: quoted pool-definiendum noun dodge (P2-3, ×4 + cap release + app-2 drop e2e).**
`"Eligible repair facility|Qualified technician|Approved laboratory|Authorized service center" means …` all release definitional:true (nouns unlisted; definiens inert to all 3 negative screens) → gateV2 **CAP RELEASED** (e2e null). AND the P5 app-2 guard is dodged by simply OMITTING requiredAttribute (an attr-less bidder_cannot_move is a legal NHR-driver shape): both-fields-definitional + no attr → kind→boilerplate → dropped → OFF=NHR → **ON=BID**. Root = same noun vocab list; doctrine violation persists ([[feedback_no_blocklist_shape_allowlist_doctrine]]).

**FALSE IN-CODE CLAIM:** the P2 comment in audit-instrument-governance.ts asserts "a menu whose elected value is 'N/A' now correctly dormant-izes" — FALSE. parseFillInValue never extracts the ☒-elected item (strips ☐ only); the parsed value is the whole menu → onSchema trips → escalate. The claimed key win does not exist in the code.

## Safe-direction notes (over-escalation / under-delivery)
- P2-5b/N8b: checkbox menu + N/A elected → still inert (see false claim above).
- P2-2 table-pipe `(b)(1) CMMC Level | N/A` → now escalates (regressed from round-2 dormant; safe).
- P2-4d curly quotes ‘Current’ (U+2018/2019 PDF substitution) + P2-4e "(a) Definitions." paragraph prefix → refused → the motivating N0016-class false-NHR RETURNS on the most realistic shapes; N8a ("certification" in definiens) unchanged.
- Round-1 R6 flipped direction: def-as-bar WITH lens-invented requiredAttribute now refused by P5 → NHR — app-2 fires only on attr-less findings, i.e. the flagship case mostly stays false-NHR.

## HOLDS
P2-1 partial/contradicted-N/A escalate (XOR belt catches level-bearing parenthetical) · P2-3 belt on listed nouns (approved source / eligible offeror) · P2-4a obligation rider refused · P2-4b/c inert + N0016 straight-quote release · P2-5a menu-with-L2-elected stays LIVE · P2-6 dormant never a show-stopper, clean-dormant → BID+note, unrelated FCL bar still blocks · flag-OFF byte-identity everywhere · tripwires S3/S5/S7 never suppress (round-1 re-run).

## Verdict
GRADE **F** — two critical e2e false-BID families (one NEW from the pivot itself, one a round-2 spec item silently not implemented) + a false in-code claim. Fix directions the fixtures encode: (1) the governing VALUE must be anchored to the GOVERNING subpart's own assignment (first assignment after the (b)(1) label, or subpart-scoped slice), never "last assignment in excerpt"; a checkbox parser must extract the ☒/☒-adjacent item; (2) pool-definiendum by adjective-shape × ANY noun (or require the definiendum noun to be a non-agent common noun before release).
