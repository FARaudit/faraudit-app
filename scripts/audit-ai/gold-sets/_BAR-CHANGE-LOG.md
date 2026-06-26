# Graduation-bar change log

Append-only. Each entry records a change to the judgment-key graduation bar or the scorer that
enforces it. Integrity rule: the bar is locked BLIND (pre-run); any change is logged here with
date + reason + scope so the audit trail shows WHAT changed and WHY, and that it was uniform.

---

## 2026-06-26 — Named-gate dimension re-specified (Brain ruling, Option A)

- **Date:** 2026-06-26
- **Change:** Named-gate dimension re-specified from **exact-disposition matching** → **concept-presence scoring**.
- **Reason:** Null-bidder semantics clash (key `unmet` ≠ engine `met` — different axes: key disposition encodes bidder-readiness, engine disposition encodes presence-in-source) + named-gate **naming non-determinism** across runs (pilot #1: `past performance`/`lump sum` matched on the stale run, non-matched on the fresh run). Exact-disposition matching was measuring naming noise, not judgment.
- **Applies to:** all 5 packages uniformly (N4008526R0065 · 1240LP26Q0067 · SPRDL125Q0030 · AOCSSB26R0023 · FA667024R0001). No cherry-picking.
- **New hard-fail definition (per package):** `fabrication` + `decoy misfire` + `verdict mismatch` + **`concept-presence miss`** (a `mustRaise` concept — token OR any alias — not surfaced ANYWHERE in the engine's analysis output). **Disposition matching → ADVISORY only.**
- **"Anywhere in output" scope (scorer impl, principled, follows Brain's wording):** the engine's ANALYSIS — raised gate names + cites + chief-judge rationale + preserved dissent + verifier claim statements. NOT the raw source text (which would trivially match everything).
- **Enforced by:** `judgment-score.ts` `scoreJudgment()` — `namedGates[].surfaced` is the hard signal; `dispositionOk` retained as advisory (`dispositionAdvisories[]`). `_GRADUATION-BAR.locked.json` updated to match.
- **Key content:** UNCHANGED at the judgment level (Brain's blind-authored concepts/tokens/aliases preserved verbatim). Mechanical-only conform: `schemaVersion` bumped `0.2-approved` → `0.3-concept-presence` to record the spec; keys re-frozen (new keySha256). Code did NOT re-author judgment content (architectural law: Code never authors keys; Code is contaminated on #1 post-pilot).
- **Decided:** blind to whether it makes #1 pass (the scorer scope follows Brain's "anywhere in output" wording, not reverse-engineered from the pilot).

## 2026-06-26 — Brain ruling on #1's 3 remaining concept misses (post-pilot)

- **`27 August 2026` (raw date):** `mustRaise` → **false (advisory)** in #1. Rule: any raw-date token → advisory (a deadline date is not a named hard concept). Scan of all 5 keys: only #1 had a raw-date token.
- **`acknowledgment of amendments` (amendment-ack):** `mustRaise` → **false (advisory)** in #1. Rule: any amendment-ack / administrative-certification token → advisory. Scan of all 5: only #1 had a clear amendment-ack token. ⚠️ #2 `Certificate of Conformance` flagged to Brain as AMBIGUOUS (cert by name but often a material deliverable) — NOT flipped pending Brain ruling.
- **`lump sum` — KEPT `mustRaise: true`. GATE-2 ENGINE GAP FINDING:** "Engine does not reliably surface pricing structure (unit vs lump sum) as a named concept. Real gap, not key error." This is a genuine engine deficiency surfaced by the gold-set, retained as a hard concept so graduation reflects it.
- **Effect on #1:** re-frozen (keySha256 updated). Remaining hard concept-miss = `lump sum` only (the real engine gap). #1 is a carve-out candidate (4/5 bar; #2/#3/#5 mandatory).

---

# Architecture Rulings

Distinct from the bar/scorer changes above — these record ENGINE-ARCHITECTURE rulings (how the engine reads/judges), kept here for one audit trail.

## 2026-06-26 — Section-coverage architecture (Brain ruling · card 37 / agentic-coverage)

- **Source of truth = B (coverage-from-MAP).** The MAP already ingests every document; coverage becomes a PRODUCT of that read — the only way to earn the claim "all sections reviewed" (read-to-confirm, not assume).
- **Front door = best-effort + A (vision fast-path).** Synchronous vision (Haiku-tier) ONLY on a hard-doc fallback (scanned / timeout / low-yield) AND only for **< 5 pages**. Larger or ambiguous → `unverified`; the MAP owns the authoritative answer. NEVER block the audit on a synchronous coverage call that can time out.
- **C (UX reframe) ships now**, independent of the architecture work — closes the trust gap on the easy cases immediately.
- **Three honest states only: `present` · `absent` (confirmed by reading) · `unverified` (reading in progress).** `unverified` is NEVER presented as "missing" (standing no-silent-drop law).
- **#2 gold-set run: UNBLOCKED.** #2's doc is readable, sections detect correctly post-harden, measurement unaffected. The agentic coverage fix is a SEPARATE track and does not gate the run.
- **Noted in ruling:** the hardened §L/§M fix (PR #95, main `1596897`) closing the unanchored-match trust-bug was correct — a HIGH-severity issue caught and closed before it reached a customer.
