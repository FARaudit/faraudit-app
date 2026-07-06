# Adjudicated Oracle Set — external ground truth (Brain card 280, 2026-07-05)

**Purpose.** The FIRST non-Claude ground truth for the audit engine. Everything before this (gold set, stress-set v2) was SELF-GRADED — Claude authored the "right" answer, then we checked the engine (also Claude) against it (`project_gold_gate_circularity`). This set's verdicts come from **external authorities** — GAO and SBA OHA — who ruled on real solicitations with real stakes. It is the safety certifier for the judgment-first engine. The gold set is DEMOTED to a regression role (still runs; no longer the safety proof).

**This is a SMOKE certificate (Brain R4).** N=6–8 with zero contradictions is NECESSARY, not sufficient — one gate among the frozen set, not a proof of safety.

## The build contract (Brain card 280 rulings — verbatim intent)

- **R1 SOURCE.** GAO + SBA OHA = external certifier. Sequence: SBA OHA size FIRST, then GAO defective-terms.
- **R2 MAPPING.**
  - SBA-ineligible → INELIGIBLE is valid ONLY when the engine is fed the OHA-established firm facts (OPEN-WORLD — never score on uninferred facts). It must reach INELIGIBLE via a grounded I8 bar, or AT MINIMUM never declare the firm eligible.
  - SBA-eligible (small) → the engine must NEVER declare INELIGIBLE.
  - GAO SUSTAINED on a defective term → the defect must surface at CAUTION/NHR minimum; NO_BID only if four-walls-proven (none here reach it).
  - GAO DENIED → negative ground truth ONLY when the denial is ON THE MERITS of the disputed term (exclude timeliness/standing/academic denials).
- **R3 MULTI-MODEL.** Gemini/ChatGPT are EXCLUDED from the oracle (an LLM is not external reality). Approved as a phase-2 diverse adversarial cross-check on outputs (CEO spend surface first). Not in this set.
- **R4 DONE-GATE.** Asymmetric criteria for external truth: BLOCKER = any committal-direction contradiction of adjudicated reality; OK = conservative misses; HARD GATE = honest-fail parity. Scored via `summarizeProofGate`.
- **R5 TERM-LEVEL vs FULL-DOC.** TERM-LEVEL certifies term detection/classification only; term text = VERBATIM decision-quoted solicitation language (Rule 64 applies to oracle inputs), provenance-labeled. The oracle pass requires **≥2–3 FULL-DOC cases (recovered full source from SAM)** to go GREEN.

## CONTAMINATION CONTROL (Brain, every case — SAFETY-CRITICAL)

1. **Never feed decision text.** The engine input (`*.source.txt`) contains ONLY solicitation language — set-aside/NAICS/size clauses, disputed specs — with ZERO reference to the protest, the decision, the outcome, OHA/GAO, or any litigation framing. The external truth + firm facts live in the manifest, NOT the engine input.
2. **Scan engine output** for any protest/decision/outcome reference — any hit INVALIDATES the case (the model recognized it). A contaminated pass ≠ a pass.
3. **Prefer post-cutoff 2026 decisions** (after the engine model's Jan 2026 cutoff → guaranteed engine-unseen). Pre-cutoff cases are labeled `calibration` and DO NOT count toward the smoke gate.

## Files

- `oracle-manifest.json` — one record per case: citation, date, class, external truth, verdict-mapping, firm facts (SBA), solicitation number, TERM-LEVEL/FULL-DOC, provenance, engine-unseen basis.
- `<id>.source.txt` — the SCRUBBED engine input (solicitation language only; NO decision text).
- `<id>.firmfacts.json` — (SBA only) the OHA-established firm facts fed as the bidder profile per R2(i).

## Status

- Case records + scrubbed TERM-LEVEL sources: BUILT ($0).
- FULL-DOC recovery from SAM (≥2–3 for GREEN per R5): IN PROGRESS.
- Scoring run (engine on each case → `summarizeProofGate` vs external truth): **PAID, CEO-GATED.** NO-GO on W9126G26RA087 holds until this pass adjudicates GREEN.
