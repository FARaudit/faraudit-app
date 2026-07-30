---
name: unit12-cert2-dry-stamp
description: Unit12 obligation garble floor — CERT-2 final independent DRY certification, CONCUR grade A, over-fire NOT FOUND
metadata:
  type: project
---

**CONCUR / grade A / DRY — TERMINAL.** Unit #12 `AUDIT_OBLIGATION_GARBLE_FLOOR` (default-OFF) at `read_no_obligation` valve (`audit-orchestrator.ts:1593`); discriminator `looksMojibake` + `fdIsLayoutGlyph` (`pdf-ocr.ts:74-93`).

**Why (arc closed):** R1(F common-word density)→R2(C total-non-ASCII)→cert-1(C symbol density, added layout exclusion) hardened the gate to: floor iff `≥300 non-ws chars AND (hard C0/C1/U+FFFD ≥2% OR non-ASCII non-letter non-LAYOUT symbol ≥25%)`. LAYOUT = §°¶· + U+2000–206F (gen-punct/dashes/quotes/bullets/dot-leaders) + U+2190–21FF (arrows) + U+2500–25FF (box/block/geometric). \p{L} letters excluded (coherent foreign script safe).

**How to apply — over-fire NOT FOUND, prod-composition proven:** The mission's flagged classes were run against LIVE code. `☐/☒` (U+2610/2612 Misc-Symbols) DO count (one block past the U+25xx geometric exclusion) — the trap — but realistic checkbox reps&certs = 1.9% (cert prose dilutes). `°`(U+00B0), `µ`(U+00B5 IS a \p{L} letter), `●■□`(U+25xx) all EXCLUDED. DECISIVE realism finding: every realistic clean section sits 2–8% symbol density, NOT 25% — real tables/matrices carry descriptive words (part names, item descriptions, FAR clause#s, cert text) that dilute glyphs 3–12×. Floors ONLY reachable by DELETING all prose (bare `¼½¾` key=100%, glued fraction table=28%, bare checkbox column=100%) = CONTRIVED, not clean → NOT dissents. Imperial hardware 8.4%, multi-currency 5.8%, checkbox 1.9%, eng-spec 2.6%, temp/angle 0% (° excluded) — all `read_no_obligation`/covered flag ON==OFF. NOTE: a "math spec" with real "shall be" verbs goes `obligations_ungrounded` in BOTH ON and OFF (non-empty obligationsOf, never enters valve) = pre-existing flag-independent, NOT a floor over-fire.

Arm A 0% on all clean (no C1/FFFD). Sanctioned under-fire: homoglyph-mostly-ASCII 23.3%→false (stays covered=status quo). Boundaries exact `>=`: hard 6/300=2.0% floors / 5=1.67% no; sym 75/300=25.0% floors / 74=24.67% no; 299<300 not judged. Determinism 3/3, flag-OFF byte-identical (genuine garble→read_no_obligation OFF / obligations_ungrounded ON), clean byte-identical ON==OFF. ReDoS 105k chars/9ms linear.

R1/R2/cert-1 all CONFIRMED CLOSED. Own probes `_cert2-unit12-{prodpath,discriminator,flagoff}.ts` (gate/tests unmodified). Deliverable `ceo/redteam-unit12-cert2.md`. SUPERSEDES the R1(F)/R2(C) dissents [[project_unit12-r1-garble-floor-overfire]] / [[project_unit12-r2-nonlatin-arm-b-overfire]] — those roots are the fixed prior states; the layout-exclusion + \p{L}-exclusion hardening resolved both.
