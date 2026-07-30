---
name: unit12-r2-nonlatin-arm-b-overfire
description: Unit12 R2 Gauntlet — looksMojibake arm-B (non-ASCII ≥30%) over-fires on clean non-English text; grade C
metadata:
  type: project
---

# Unit12 R2 — obligation garble floor, arm-B non-ASCII over-fire

Grade **C**. Target `AUDIT_OBLIGATION_GARBLE_FLOOR` valve @ `audit-orchestrator.ts:1593`, discriminator `looksMojibake` @ `pdf-ocr.ts:67` (arm A: hard-corruption C0/C1/U+FFFD ≥2%; arm B: total non-ASCII codepoint>0x7e ≥30%).

**R1 CLOSED** (verified live): clean WAGE/CLIN tables stay read_no_obligation/covered under floor ON both AUDIT_TXT_INGEST states. Density-axis over-fire not reintroduced.

**NEW break = arm B conflates mojibake with legitimate non-English script** (both live >0x7e; raw density can't separate). Gate comment's "clean ASCII text scores ~0 ⇒ ZERO over-fire by construction" is FALSE — "ASCII" silently load-bearing.
- **P1** bilingual notice: clean readable ENGLISH controlling half + Chinese convenience-copy → 39% na → FLOOR. English is not garbage → genuine over-fire. PROVEN prod: read_no_obligation→obligations_ungrounded/INCOMPLETE.
- **P2** Vietnamese PROSE (Latin script, tone-marked) = 31.2% na → FLOOR (defeats unstated "Latin=safe"; accent ROSTER only 12.6-29.7%, just under). PROVEN prod flip.
- **P3** pure foreign-only SOW (CJK 99.7%/Arabic 98.7%/Cyrillic/Greek ≥97%) → FLOOR. Direction arguably CORRECT (English-only obligationsOf can't certify "no obligation" on unparseable foreign text → INCOMPLETE safer) → calibration/doc defect not dangerous pass.

**Confirmed SAFE:** symbol/math §C (9.45%), smart-punct (3.81%), form-feed U+000C + BOM U+FEFF stripped by `\s+` before count → arm A cannot fire on page artifacts. Boundaries exact: na 30.00%→FLOOR/29.67%→ok; hard 2.00%→FLOOR/1.67%→ok; <300 non-ws not judged.

**Fix direction:** arm B should require INCOHERENCE not density — count only non-ASCII in Latin-1 punct/symbol band (mojibake signature), NOT coherent single-script letter blocks (CJK/Arabic/Cyrillic/Greek/Hangul/Vietnamese-Latin). For P1 bilingual: rescue if a large clean ASCII/English span coexists. Scope the "zero over-fire" comment to ASCII/Latin. Arm A is sound, leave it.

Report `ceo/redteam-unit12-r2.md`. Probes `_rt-unit12-r2-{discriminator,nonlatin,prodpath,valve-isolated,bilingual}.ts`. Continues [[project_unit12-r1-garble-floor-overfire]].
