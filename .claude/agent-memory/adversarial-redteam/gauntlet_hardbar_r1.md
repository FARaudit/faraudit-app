---
name: gauntlet-hardbar-r1
description: deriveHardBarFloor FINDING round R1 — grade F; 14 break classes (5 P0 over-fires) incl. vehicle-ESTABLISHMENT "Only one BPA will be awarded" false-NHR, classOfFinding 52.219-citation hijack killing suppression over MET bars, personnel-clearance subject-scope miss, negation/at-award laundering; fulltext-boilerplate guards HOLD
metadata:
  type: project
---

# deriveHardBarFloor gauntlet R1 (2026-07-22) — grade F

Probe script `scripts/audit-ai/_gauntlet-hardbar-r1.ts` (18 BREAK / 11 OK, replayable). Report `ceo/GAUNTLET-HARDBAR-R1.md`. Judge round pending (B3 split).

## P0 over-fires (executed)
1. **Vehicle-ESTABLISHMENT collision** — "Only one BPA will be awarded" / "award of the IDIQ will be limited to a single offeror" → vehicle_holder NHR on OPEN competitions establishing the vehicle. Root: TERM co-occurrence only; the in-code "class must be the SUBJECT" comment is unimplemented (same false-comment pattern as round-3 menu-win).
2. **classOfFinding first-match hijack** — hay = requirement+excerpt+citation+attr, set_aside regex (incl. bare `\b52\.219-\d`) checked FIRST → a met/handled clearance finding citing 52.219-14 loses its class → suppression dead → NHR over a PROVEN-met bar. Reusable probe: any class ladder keyed on concatenated hay + first-wins is hijackable by citation strings.
3. **Personnel-clearance subject miss** — "Contractor personnel … must possess … security clearance at time of proposal" fires clearance NHR; subject regex prefix-matches "Contractor", gap swallows "personnel"; violates #557/Phase-5 subject-scope doctrine; correct pipeline handling (gate_to_clear) NEVER suppresses by design → guaranteed over-fire.
4. **Negation/at-award laundering** — "not required at time of proposal; successful offeror must possess prior to award" → NHR (FLOWDOWN only names "issued at award"; semicolons never segment).
5. **Set-aside prose-vs-matrix anchor miss** — lens grounds §L prose, floor keys matrix row, no 5-word overlap → BWC cap on proven-in-pool firms (mass frequency). Anchor-level suppression fails when the SAME obligation lives in two textual homes.

## Under-fires (P1)
- Newline-splitting sentences() → floor inert on hard-wrapped PDF text (dominant source shape).
- POSSESSION_FRAME omits singular "is required to" (standard provision register).
- WIRING (decide.ts:3257): ruling-3 "∪ SAM setAside metadata" never threaded — floor starved on matrix-less SF1449 packages (the exact false-BID the class was added to close).

## Held (worth remembering)
- CLAUSE_SOURCE_FULLTEXT boilerplate guards HOLD on live-verified verbatim texts (acquisition.gov 2026-07-22): 52.204-7(b)(1) current+legacy, 7019(b), 7021(d)(1)(i) fragment±lead-in, §K rep. My design-review's mass-fire prediction was WRONG for these exact texts — the frame gaps that cause under-fire also block the boilerplate. COUPLED HAZARD: legacy 52.204-7 text contains "basic ordering agreement" = a TERM_VEHICLE term; its only protection is the "is required to" frame gap — fixing that under-fire gap re-opens a vehicle_holder universal fire. "Excluded by construction" was true only of TERM_SPEC_REG.
- Bounded `[^.?!]{0,N}` gaps: no ReDoS (15ms on 500×599-char adversarial).
- grep silently fails on audit-decide.ts in this sandbox (huge-line UTF-8 file) — use python3 find; don't trust empty grep output as absence.

Links: [[design-move4-hardbar-floor-review]] (the class-vs-instance suppression warning materialized as the hijack + anchor-miss pair) [[gauntlet-ab-round3]].
