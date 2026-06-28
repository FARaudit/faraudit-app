# Gold-set living-benchmark doctrine

**Status:** ENDORSED by Brain, 2026-06-26 (card 38). Standing doctrine for the judgment-key gold set.
**Why this exists:** the keys must stay *ahead of* the model as Claude advances — never a frozen monument that decays. A blind, human-adjudicated key measures the CORRECT ANSWER (set by the solicitation + FAR/DFARS reality), not the model's behavior, so a smarter model does **not** stale a correctly-authored key. Keys go stale only from (a) the world changing, (b) treating a regression FLOOR as a quality CEILING, (c) coverage drift. This doctrine closes all three.

---

## ANCHOR — the regression floor
- The frozen keys are a **regression floor**, authored **blind** (CEO + Brain, never Code), re-run on every model swap and every engine change.
- Guarantee: **never regress.** A model/engine change adopts only if the anchor still passes.
- **Non-negotiable distinction:** "passes all keys" = *"didn't get worse."* It does **NOT** mean *"best-in-class."* Any internal comms, gate definition, or investor narrative that conflates floor with ceiling gets corrected. Floor ≠ ceiling.
- **Architectural law preserved:** Code never authors judgment content. Code freezes + hashes only.

## FRONTIER — the challenger loop (the anti-staleness engine)
- **Cadence: quarterly (every 90 days).** Point the **newest available Claude** at the existing keys *adversarially*. Explicit prompt: *"What does this benchmark miss? What would a sharper analyst catch that this key doesn't encode?"*
- **Promotion rule:** model proposes → **Brain + CEO adjudicate BLIND** (without seeing which package or the prior key) → if valid, **Code freezes** the promoted entry. **Code never authors.** Same firewall as the anchor, no exceptions.
- **Hard gate on promotion:** a model-proposed finding that Brain cannot independently verify against the source solicitation does **not** get promoted. (No model-mimicry creeping back in — the anchor against circularity.)
- **Effect:** the smarter the model gets, the harder it probes its own benchmark → the bar climbs *with* the frontier instead of being capped below it. The advancing model feeds the benchmark's growth; blind human adjudication keeps it honest.

## REFRESH — keeping keys current with procurement law
- **Event-driven triggers:** any FAR/DFARS rewrite · any CMMC phase date passing · any new clause category added to the engine.
- **Periodic sweep:** semi-annual.
- On a trigger, re-adjudicate the affected keys (blind, CEO+Brain).

## VERSIONING — as-of procurement-law date
- Every key carries an **`asOfProcurementLawDate`** (ISO `YYYY-MM-DD`) = the FAR/DFARS/CMMC baseline it was authored against.
- When a key is **superseded by regulatory change**, the old version is **ARCHIVED (not deleted)** and a new version frozen with the updated as-of date.
- The regression suite always runs against the **current** version; the archive is the **audit trail** only.
- Schema: `asOfProcurementLawDate` field added to `_JUDGMENT-KEY-SCHEMA.proposed.json` (v0.4-benchmark-doctrine).

## OUTCOME FLYWHEEL — real bid results as ground-truth keys
- **Start capturing NOW**, even pre-scale. Every real bid outcome is **harder ground truth than any human-adjudicated key — the market adjudicated it.** Collection cost ≈ 0 today; compounding value is highest if started early.
- **Schema fields added** (`_JUDGMENT-KEY-SCHEMA.proposed.json` v0.4): `outcome.result` = `won | lost | no-bid | null` + `outcome.awardDate` (ISO, or null).
- These become the **highest-weight keys** in the challenger loop once volume exists.

---

## At a glance
| Layer | Moves with | Cadence | Authored by |
|---|---|---|---|
| ANCHOR (frozen keys) | never regresses | every model/engine change | CEO+Brain blind; Code freezes |
| FRONTIER (challenger) | the newest Claude | quarterly | model proposes → CEO+Brain adjudicate blind → Code freezes |
| REFRESH | procurement law | event-driven + semi-annual | CEO+Brain blind |
| OUTCOME FLYWHEEL | the market | continuous (capture now) | reality (won/lost) |

**The net:** 6 months / 2 years / 5 years out, the gold set is not anchored to stale keys — it's a living benchmark the advancing model itself keeps pushing forward, with blind human adjudication as the truth anchor. The risk was never model-staleness; it was treating a floor as a ceiling and letting regulatory/coverage drift go untracked. This doctrine closes both.
