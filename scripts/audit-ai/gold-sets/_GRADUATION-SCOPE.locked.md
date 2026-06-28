# Agentic-engine graduation — FROZEN SCOPE + Definition-of-Done

**Status:** LOCKED v2 (RE-FROZEN) — original 4 fixes + Brain card-40 EXPANSION (2 named fixes + disposition correction). CEO CONFIRMED the 9-point DoD + greenlit the expansion 2026-06-26.
**Authority:** Brain ruling on card 39 (2026-06-26). Re-sequences the 5-package Gate-2 plan.
**Trigger:** #2 Gate-2 returned honest-INCOMPLETE — a binding attachment (`C04 Specs_Mini-Excavator.pdf`, the LPTA spec) routed to NO lens. Brain: honesty correct, **routing is the bug.**

## Re-sequencing (the key change)
The **gold SET is the BUILD TARGET**; the **5 frozen keys are the ACCEPTANCE TEST of the graduated engine** — run ONCE, AFTER graduation, never as drivers of incremental fixes. One-key-at-a-time against the current engine = the treadmill (every key re-surfaces the same coverage gap). **Graduate first → then run all 5 keys against the finished engine.**

## FROZEN SCOPE — exactly four fixes (NO additions without a NEW card)
1. **Route-everything** — every binding attachment routed to **≥1 role-appropriate lens**, by document ROLE. **HARD GUARD (Brain):** must NOT collapse to one catch-all lens — that reproduces the deployed engine's stuffing. Route by role to the right lens.
2. **Coverage-from-MAP** — coverage measured from the **MAP read**, not the ingestion log (ingested ≠ analyzed; bytes-in-context is not a grounded read).
3. **Vision fast-path** — Haiku-tier synchronous vision ONLY on a hard-doc fallback (scanned / timeout / low-yield) AND only for **< 5 pages**. Larger/ambiguous → `unverified`; MAP owns the authoritative answer. Never block the audit on a sync coverage call.
4. **UX reframe** — three honest states `present` / `absent` (confirmed) / `unverified`. Never present `unverified` as "missing".

## DEFINITION OF DONE (Brain-proposed — CEO to confirm)
1. **100%** of binding attachments in each gold package routed to ≥1 role-appropriate lens (from MAP).
2. **All 5 gold packages return COMPLETE** — no INCOMPLETE from an unrouted binding doc.
3. **Verdict matches `expectedVerdict`** on each frozen key (1240LP26Q0067 → BID, etc.).
4. **Honesty gate intact** — still fires on any real package with a genuinely unreadable/missing binding attachment. **HARD STOP: real manifests only — do NOT manufacture a synthetic failure to test this. The #2 run is itself the evidence the gate works.**

### Standard ship-gates (engineering hygiene — NOT new scope, fold in or drop)
- tsc clean + existing deterministic gate suite green.
- Cost-in-band on the 5-package end-to-end proof (Console-actualized; graduation must not blow the ~$0.34–0.80/run envelope materially).
- Flags stay OFF on the customer path until ALL DoD criteria pass; flip is a separate explicit step.

## Guardrails (what keeps "comprehensive" from becoming its own patchwork)
- Scope frozen to the four fixes above. Any addition = a new card, not a silent expansion.
- DoD locked BEFORE build, not discovered during.
- Honesty gate untouched.

## Separate from build (do NOT fold into scope)
- **Track 3 content/positioning:** the divergence — deployed-engine confident (PROCEED_WITH_CAUTION / fit 81) vs honest agentic INCOMPLETE on identical unread binding content — is the live demonstration of the trust thesis. Capture for content/positioning (Brain writes when activated). Logged as a content backlog note, not a build item.

## Hold
No spend, no build until **CEO confirms the DoD + greenlights.** Section fix is LIVE on prod; doctrine files committed `c486c3b` (local).

---

# EXPANSION — Brain ruling on card 40 (2026-06-26)

**Why it's not scope-creep (Brain):** the gold key completed the graduation definition the attachment-fix left under-scoped. Same doctrine as the routing fix, one level up — *every binding content unit must reach a role-appropriate lens: **sections**, not just attachments.* Graduating while §L/§M/§I/§B go unread reproduces the exact failure class we just closed. ONE bounded expansion; re-freeze after; no further additions without a new card.

## Two named fixes (the ONLY additions)
**(a) Coverage-depth** — §L/§M/§I/§B content actually reaches its lenses. Carries the missed `submit pricing for all items` concept (a §B extraction miss — same root cause) and §I clause detection. Root cause: section content not reaching a lens (3 lenses returned INSUFFICIENT_INFO on #2).
**(b) Fabrication-suppression** — source-cite-gate every raised clause: **no clause raised without a literal source cite; suppress any clause not present in the source.** Inferring 52.219-14 from "Total-SB set-aside" is the prohibited inference (Rule 64: a clause the document never contained cannot be cited as document truth). A graduated engine that fabricates is not graduated.

## Plus — disposition-logic correction (counts inside (a)/(b), NOT a third lane)
Requirements the **bidder must fulfill at proposal time** (LPTA acceptability, enclosed-cab, Certificate-of-Conformance, exact-machine brochure, …) default to **UNMET / gate-to-clear**, **never MET**. Marking them "met" pre-bid is a category error (reading bidder-side requirements as already-satisfied — a soft fabrication, asserting satisfaction with no proposal to satisfy it).

## Verdict re-adjudication (sequencing note from Brain)
Engine is WRONG; target is **BID** (the unmet gates are routine clearable execution — the *work* of bidding, not a threat to the bid decision; Buy-American / NAICS-size / 90-day-hold are standard on a Total-SB set-aside the firm is eligible for). BUT part of the current `BID_WITH_CAUTION` is **manufactured by thin §L/§M/§I reads** — so fix coverage-depth + disposition FIRST, then **re-adjudicate**. Only if it still says BID_WITH_CAUTION on full reads is it a pure calibration error to chase.

## UPDATED DoD (the original 4 + these 5 — CEO to confirm)
1. **No clause raised without a literal source cite; zero clauses in output that are absent from source.**
2. **§L/§M/§I/§B content reaches its lenses** — zero INSUFFICIENT_INFO caused by unrouted section content; `submit pricing for all items` surfaced.
3. **Bidder-fulfilled requirements disposition as UNMET gates, not MET.**
4. **Re-graded against `5649b421`: verdict resolves to BID, fabrication gone, missed concept present.**
5. **All 5 gold packages re-proven end-to-end** before any key is scored.

## Hold (Brain)
CEO confirmed + greenlit 2026-06-26 — build authorized.

---

# GRADING MODEL — Brain ruling on card 41 (2026-06-26, CEO greenlit). BAR FROZEN AFTER THIS.

**This closes the grading definition — it is a structural definition of "converged," not another per-finding patch. The bar is frozen after this; a third re-definition would signal the gold-key approach itself isn't converging (a different conversation).**

## The unifying rule — CONTROLLABILITY TEST (shared by the disposition prompt AND the verdict judge — ONE rule, not two)
- **Bidder CONTROLS satisfaction** (sourcing / pricing / configuration / documentation) → an **unmet GATE-TO-CLEAR**: does NOT disqualify, does NOT downgrade the verdict. The bidder resolves it by doing the work.
- **Bidder CANNOT move it regardless of effort** (eligibility bar · single-source/proprietary spec the firm can't legally supply · unattainable past-performance · exclusivity) → a **DISQUALIFYING BAR**: may NO_BID / downgrade.
- Narrow ≠ restrictive-to-us. Narrowness alone is NOT materiality. (Enclosed-cab + GVWR 3,500–4,500 lb = a commodity sourcing/config task the firm controls → routine → BID.)
- **Judge must STOP double-counting:** when satisfiability is firm-dependent/unknown, verdict stays BID and the spec goes on the unmet-gate list — pick ONE, it's a gate, not a verdict-downgrade.

## The new grading bar — replaces single-run hard-pass (Q2, ASYMMETRIC)
Run **N = 3–5** panel runs of the same package. Two axes, graded differently (the customer runs it ONCE):
- **COMPLETENESS axis** (verdict · must-raise concepts · gate dispositions) → **CONSENSUS** (majority across N). A hard key must NOT hinge on a tail/depth finding that appears 1-in-2 runs.
- **CORRECTNESS axis** (fabrications · disqualifying-misclassifications e.g. "100% set-aside = disqualifying" · absent-decoy misfires DEI / "unenforceable supplier terms") → **UNANIMITY / ZERO-TOLERANCE**. ONE occurrence in ANY of the N runs = FAIL. Best-of-N may NEVER hide a correctness error — the customer could get that 1 run.
- This is doctrinally exact: the moat is "complete AND correct." Completeness tolerates consensus; correctness tolerates nothing.
- **Variance reduction** (pin settings / lower effort where it costs no reasoning quality) = a tuning lever, NOT the grading definition. Do not over-pin / lobotomize the lenses.

## Scorer backstop (Q3, defense-in-depth)
A **disqualifying disposition on an eligible-for provision** (e.g. the set-aside) is a **correctness-class error** → fails the run even if the prompt regresses. Same defense-in-depth as fabrication (lens-prompt fix + raw-output scrub).

## UPDATED DoD (supersedes "re-graded against 5649b421" single-run item)
- The N-run asymmetric bar above IS the acceptance test: consensus on what it must FIND, unanimity on what it must NOT FABRICATE/misclassify.
- HOLD all paid runs until the grading model is BUILT; then ONE confirmation N-run (separate greenlight). No iterative paid runs against a moving bar.

---

# SCORER ALIGNMENT — Brain ruling on card 42 (2026-06-26). Consistency fix, model UNCHANGED.

Edit scoped to the decoy semantics in `judgment-score.ts` only; the consensus/asymmetric model is untouched.
- **Tier 1 — disqualifying-misfire (ZERO-TOLERANCE / unanimity):** a decoy counts as disqualifying ONLY when it lands in **show_stoppers** OR drives a **NO_BID/INELIGIBLE** verdict (an absent-decoy raised at all stays a fabrication-class Tier-1 fail). Any occurrence in ANY of N runs = hard fail. The trust-breaking class, exactly as strict as before.
- **Tier 2 — disposition-misfile (CONSENSUS / majority):** a decoy listed as a **met=false** gate-to-clear when it should be **met=true** (an eligibility the firm holds, e.g. the set-aside) or **omitted** (EEO/DEI · commercial T&C · unenforceable-terms boilerplate). Graded on majority — a 1-of-N slip is tolerated; a SYSTEMATIC misfile fails. The guard so "not disqualifying" never becomes "not scored."
- Prompt fix kept as **defense-in-depth** (lens: set-aside=met=true, boilerplate omitted; judge: only an uncontrollable bar → show_stopper).

## DoD for the confirmation N=5 (Brain card 42 — bar STAYS FROZEN)
- verdict **BID by majority** · all must-raise concepts by majority · **zero fabrication** (unanimous) · **zero disqualifying-misfire** under the new show_stopper definition (unanimous) · **disposition-misfiles cleared on majority**.
- This closes the grading-definition work. ONE confirmation N=5 after the edit lands; hold all paid runs until CEO greenlight.
