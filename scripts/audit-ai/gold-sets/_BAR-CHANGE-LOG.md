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

## 2026-06-26 — Completeness criterion (Brain ruling · card 47 → B-corrected · Architecture Ruling)

Context: the v3 field proof on #2 failed CLOSED to INCOMPLETE because §C produced 0 grounded findings under the old criterion (per-section ≥1 finding). The engine behaved as designed (honest-fail, no fabrication, no false BID) — a blunt gate, not an unsafe one.

- **Reject A (per-section ≥1 finding).** Conflates "section honestly handled" with "section produced a finding." A genuinely thin §C (brochure of exact machine + price the CLINs) is fully handled with zero §C-labeled findings → A guarantees chronic INCOMPLETE on clean packages.
- **Reject naive B.** "Every obligation grounded" with a model free to wave "nothing new, §L has it" re-arms the §C root-cause one layer up (read-then-silently-dismiss).
- **RULING — B-corrected (completeness = obligation-coverage with three binding guards):**
  1. **Every binding section READ** — tool-pulled, MAP-confirmed present (preserves the §C guarantee; read-to-confirm, never assume).
  2. **An empty binding section must emit an explicit grounded `no-residual-obligation` attestation** — naming what it carries and where each obligation is grounded. Silence is NEVER coverage; zero findings on a binding section = INCOMPLETE.
  3. **The "grounded elsewhere" claim must cite specific finding IDs** — not a model assertion. §C "brochure of exact machine" → completeness requires the actual proposal_manager finding that grounds it. No pointer, no completeness.
- Kills both A's chronic-INCOMPLETE and naive-B's silent §C wave-off.
- **Sequence:** $0 diagnosis (thin vs bug) → wire B-corrected → separate CEO greenlight for the #2 re-run. No spend until diagnosis returns AND B-corrected is wired.

## 2026-06-26 — maxShowStoppers semantics (Brain ruling · card 53 · Architecture Ruling)

Context: #3 (SPRDL125Q0030) ran INELIGIBLE earned, but surfaced 3 show-stopper ROWS for ONE logical Dillon sole-source bar (C.14 / CLIN-0001AA / L.6c, three lenses). Pre-run blind-locked rubric had designated show-stopper COUNT as **advisory-only** (the "show-stopper fuzzy probe"), so the count did NOT gate #3 — re-gating on it post-run would break blind-lock integrity. **#3 = earned pass.**

- **Ruling (all keys): `maxShowStoppers` counts distinct LOGICAL bars, not finding rows.** The metric asserts how many genuine barriers exist in the solicitation — a fact about the world, not about dedup plumbing. "One sole-source bar corroborated at three anchors" is ONE bar, three citations (a stronger finding than a bare row). No key VALUES change (#2=0, #3=1 are already logical-bar counts); only the grader's counting function changes.
- **Dedup = report-quality polish, downstream of verdict derivation ONLY** — never feeds back into deriveVerdict/firmStatus (the proven deterministic core is untouched). Implemented as `logicalShowStoppers()` in audit-decide.ts.
- **Conservative merge key:** same controllability AND a shared distinctive object identifier (part/CAGE number). NOT an OR over section-cite or loose token (two distinct bars can share a section or "OEM" by coincidence → could mask an over-fire). When in doubt, DO NOT merge. All citations retained.
- **Proven by REPLAY** over #3's captured findings (3 Dillon rows → 1 bar, 3 citations, INELIGIBLE unchanged) + load-bearing negatives (distinct named-part bars stay separate; coincidental section/token no-merge; different-controllability no-merge). No paid re-run.

## 2026-06-26 — Gold-set source-completeness (Brain ruling · card 57 · Architecture Ruling)

The integrity property is NOT "can we re-confirm the original SAM attachment count" — it's "does the engine run against the COMPLETE artifact, free of the §B/§C content-loss class" (wage-determination/PWS overwriting primary sections — the months-of-UNKNOWN bug). Internal consistency (key authored from the same FULL-SOURCE the engine runs) is necessary but NOT sufficient: a set trimmed BEFORE the key was authored makes key+run jointly wrong (same shape as the knife-edge shared-miss).

- **#4/#5 NOT blocked by SAM-non-verifiability.** They graduate after (i) reconciliation against the solicitation's OWN internal attachment manifest (SF1449 block 27 addenda / "List of Attachments" / L references) passes, and (ii) the content-loss guard confirms §B/§C present + not overwritten. Both $0.
- **Standing rule — complete package, never a model-trimmed copy** (open sols via engine SAM-fetch; §C root-cause lesson encoded), with three amendments:
  1. Archived completeness is established by **internal-manifest reconciliation + sha256 freeze**, not inspection judgment.
  2. A frozen anchor's source is **IMMUTABLE** — no re-pull/substitute under a frozen key; a substitute sol is a NEW key, not a refreshed old one (swapping source breaks freeze provenance).
  3. Manifest-reconciliation is a **standing pre-graduation gate for every future archived key**, not a one-off.
- **Key A (NO_BID) still has NO valid source.** Card-56's keyword recon re-surfaced #5/#4/#3 (already frozen as CAUTION/INELIGIBLE) — contradictory provenance, not new sources. A NO_BID key must come from a genuinely NEW currently-open solicitation carrying a real universal impossibility (real-doc provenance or explicitly-labeled FRONTIER-adversarial mod).

## 2026-06-26 — #4 & #5 RETIRED as invalid-frozen + the completeness asymmetry (Brain ruling · card 58 · Architecture Ruling)

Reconciliation (card 57) revealed #4/#5 were authored against INCOMPLETE source. A CAUTION verdict = "no disqualifying bar found" — valid ONLY if the read was complete. #5 returned CAUTION never having seen Attachment 1a (459-pg Specification — the one doc where a buried bar / restrictive spec / QPL-or-equal lives). That is not a key with a gap; it is a key whose verdict is UNFOUNDED.

- **#5 FA667024R0001 — RETIRED (invalid frozen).** sha 42c65df… intact but content incomplete; §C substance (Attachment 1a) never captured = the content-loss root cause wearing a clean label. The spec is NOT immaterial (it is the single most determinative document). Old CAUTION label does NOT carry — must be re-adjudicated blind from complete source (true verdict unknown: could be NO_BID/INELIGIBLE if a bar is in the spec).
- **#4 AOCSSB26R0023 — RETIRED (invalid frozen).** J.7 HazMat / J.8 Lead Work are scope/compliance docs (specialized-licensing bars / comply-to-win obligations live there); cannot rule immaterial. Absent content could ELEVATE the verdict, not just add detail.
- Both retained ONLY as the gap/provenance record; removed from the active graduation set.

**ASYMMETRY DOCTRINE (encode):** source-completeness gaps threaten "no-bar" verdicts (BID/CAUTION) far more than "bar-found" verdicts (NO_BID/INELIGIBLE). A real bar can't be un-found by adding documents → #3 INELIGIBLE is ROBUST to source gaps and STANDS. BID/CAUTION assert the ABSENCE of a bar — trustworthy only if the read was complete. This is why #4/#5 fall and #3 stands.

**GATE PROMOTED:** manifest-reconciliation is now a PRE-FREEZE gate (no key freezes until manifest-reconciled). PRODUCTION: the engine caps any BID/CAUTION at INCOMPLETE when a manifest-named attachment went unfetched (a "no bar found" verdict on a package you didn't fully read is the §C failure with a clean label). INELIGIBLE/NO_BID are NOT capped (bar-found is robust).

**CAUTION-CLASS GRADUATION:** #1 (33/33 verified) is the only valid caution anchor now; "one package graduates nothing" → caution-class graduation requires #1 + ≥1 re-sourced anchor. #1 can run for SIGNAL on the knife-edge gate.

## 2026-06-26 — Carve-out KILLED + #4/#5 reclassified (Brain cards 64/66/68 · CEO carve-out-kill confirmed · pre-scored)

**Pre-scored attestation:** this amendment is made BEFORE any paid run scored ANY key (balance ~$84, zero paid grading runs against the v2 keys). It is driven by source/scope FINDINGS (not by seeing results) → it does NOT recreate the gold-recall circularity. Authored by Code; doctrine by Brain; carve-out kill confirmed by CEO 2026-06-26.

**BEFORE-STATE (snapshot of `graduationBar_across5` prior to this edit):**
```json
{
  "minimumPass": "4 of 5",
  "mustPass_noCarveOut": ["1240LP26Q0067", "SPRDL125Q0030", "FA667024R0001"],
  "carveOutCandidates": ["N4008526R0065", "AOCSSB26R0023"],
  "note": "#2 BID-clean anchor + #3 INELIGIBLE fire + #5 bond-inversion MUST pass. The single allowed carve-out (if needed to reach 4/5) may only be #1 or #4."
}
```

**WHY:** (1) #5 FA667024R0001 is a TRUE construction procurement (NAICS 236220 + SF-1442) → reclassified to **oos_detection** (engine honest-fails OUT_OF_SCOPE before any paid call; the "bond-inversion MUST pass" verdict expectation was authored on the pre-spec partial source and is void). (2) #4 AOCSSB26R0023 is NOT construction — its source classifies it NAICS **541990 professional services** ("does NOT establish a set-aside") → restored as an **in-scope full_verdict CAUTION** key (v2), refilling the CAUTION verdict pole #5 vacated. Its caution basis was source-corrected (card 67): Davis-Bacon AND SCA are both explicitly NOT applicable → wage-determination is a must-NOT-raise decoy, not a caution. (3) CEO **killed the carve-out**: no in-scope key may be carved out to reach the bar.

**AFTER-STATE:** in-scope full_verdict mustPass = {N4008526R0065, 1240LP26Q0067, SPRDL125Q0030, AOCSSB26R0023}, ZERO-miss · oos_detection mustFire = {FA667024R0001}, ZERO-miss · **no carve-out**.
