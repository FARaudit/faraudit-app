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
