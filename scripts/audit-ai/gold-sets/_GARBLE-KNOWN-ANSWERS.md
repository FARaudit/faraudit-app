# GARBLE KNOWN-ANSWERS — sentence-level classifier regression pins (routed item E, card #703)

**Why this is not in `gold-set-registry.json`:** that registry keys **solicitation-level** judgment (sol → verdict
pole). A garble specimen is a **sentence-level classifier** known-answer (importanceOf / hasBarSignal). It gets its
own record so the ingest-garble class is tracked from now, per Brain repair-unit routed item E.

---

## SPECIMEN G1 — "electronica" (FA813726R0033, first live run, audit `2ababbc3`)

The universal reps-&-certs recital, as the engine **actually ingested it (OCR-garbled)**:

```
The offeror shall provide a statement the offeror has completed the annual representations and certification electronica
```

Measured by execution (Jul 23 2026, live flag set):

| input | `hasBarSignal` | `importanceOf` | routes to |
|---|---|---|---|
| **clean** ("…representations and certifications electronically via SAM.") | `false` | `boilerplate` | **released** (never a bar) ✅ |
| **garbled** ("…certification **electronica**") | `true` | `ambiguous` | fail-toward-disqualifier → `disqualifierUncovered` → NHR headline ❌ |

**Root:** the OCR garble ("certification" singular + "electronica" truncation) trips `hasBarSignal`, which (a) blocks
the NOOP-REP boilerplate release (`audit-gate-v2.ts:325` requires `!BAR_SIGNAL_RE`) and (b) blocks the
ambiguous-signal demotion → a benign universal recital becomes a disqualifier.

**CURRENT BEHAVIOR (accepted interim):** garbled → `hasBarSignal=true, importanceOf=ambiguous` → escalates. This is
**documented and accepted** until the enumeration-layer unit (#696) lands garble-robust release predicates. It is
fail-safe on the *pole* (NHR, never a false-BID); its only harm was the headline, now addressed by item A
(`AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST`) which leads with the grounded gate instead.

**TARGET BEHAVIOR (post-#696):** garbled recital is recognized as boilerplate and **released** — expected
`importanceOf → boilerplate`, out of `disqualifierUncovered`. When #696 lands, the target-assertion in the
enumeration-unit gauntlet flips this specimen from "escalates (interim)" to "released (target)".

**Owner:** enumeration-layer overhaul, `ceo/CARD-696-ENUMERATION-LAYER-DESIGN-INPUTS.md` INPUT 8 (garble-robustness
of the recital-release predicates). Not a spot patch — the ingest-garble class gets its design treatment there.
