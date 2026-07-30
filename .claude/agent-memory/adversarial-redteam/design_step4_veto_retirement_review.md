---
name: design-step4-veto-retirement-review
description: STEP-4 verbatim-veto retirement DESIGN review — grade D, does NOT survive as ordered; retirement fails its OWN ratified gold-set gate at flag-ON (25/28, 2 false-BIDs) and silently co-retires the ARMED covered_direct hard-bar floor; live worker env is the only valid flag authority
metadata:
  type: project
---

# STEP-4 veto-retirement design review (2026-07-22) — grade D, NO as a build order

Probes `scripts/audit-ai/_redteam-step4-registers.ts` · `_redteam-step4-flips.ts`. Ledger `ceo/PANEL-STEP4-REDTEAM.md`.

Reusable structural findings (apply to ANY future "retire a deterministic gate" unit):

- **RUN THE GATE, don't reason about it.** Two prior seats argued registers; nobody ran the ratified instrument
  with the flag ON. `_shadow-acceptance-corpus.ts` flag-OFF = 28/28 / FALSE-BIDs 0; flag-ON = 25/28 / **2
  false-BIDs**. A design that fails its own ratified hard line on execution is a D regardless of the prose.
- **INVENTORY WHAT DIES WITH THE GATE.** The retired `disqualifierUncovered` cap was the ONLY live escalation
  route of the ARMED `AUDIT_COVERED_DIRECT_BAR_FLOOR` (+ subordinate `AUDIT_ELIG_BAR_PASSIVE_FRAME`): the floor
  emits bar sentences as `obligations_ungrounded`, and its documented V1 fallback (`missing→INCOMPLETE`) is
  unreachable under `AUDIT_GATE_V2=true`. Retirement converts a Gauntlet-DRY'd panel-ratified unit into dead
  code, unnamed in every scope note. ALWAYS grep consumers of the retired authority before signing.
- **FLAG AUTHORITY = the Railway audit-worker env, NOT `ceo/flip-vercel-committal.sh`** (that's Vercel; ≥8
  engine flags differ). Two ex-KO findings died on this: `AUDIT_SETASIDE_BACKSTOP` is ABSENT/OFF (so "part B
  owns SF1449 block 10" is false coverage) and `AUDIT_COVERED_DIRECT_BAR_FLOOR` is TRUE (ex-KO assumed OFF).
  `railway variables --service audit-worker --kv` works; use it.
- **Gold-set counter is category-substring-driven** (`_shadow-acceptance-corpus.ts:163`): only
  INELIGIBLE/uncovered/BINDING-a/non-self/adversarial count. `real-bar/NHR`, `genuine-incomplete`,
  `temporal/true-closed`, `root2-exists/*` flipping to BID count ZERO. Any new labelled specimens are invisible
  unless the category string is allow-listed. Also `authoritative:true` specimens run `deriveVerdict`, the rest
  run `deriveShadowVerdict` — so the gate miscalibrates BOTH ways (shadow retired `documentsComplete`, so its 2
  "false-BIDs" are not live; the authoritative 44-record census showed 3 flips, all NHR→INCOMPLETE, 0 committal).
- **LEXICAL-ACCIDENT rule**: register coverage is decided by whether the drafter used one of `obligationsOf`'s 8
  duty verbs, and by whether `clearance|certif|accredit|licens` appears in the SAME `(?<=[.;\n])` fragment.
  "a SECRET facility clearance is required" → NHR; "a SECRET FCL is required" → null. Escalation that depends on
  an abbreviation is not ownership.
- **`importanceOf:299` BOILERPLATE_RE branch has NO `!BAR_SIGNAL_RE` guard** (the NOOP-REP branch at :302 does).
  Executed: "Offerors shall provide a copy of their current facility clearance certificate with the proposal"
  → barSignal=TRUE, importanceOf=**boilerplate**, dropped entirely. A live violation of card-301 fail-toward-
  disqualifier, retirement-independent.
- **(c) "routes to #575" is not a disposition while `bidderProfile` is optional/null-by-default** — it is a gap
  wearing an owner's name. #575 owns only the FIRM side of an eligibility JOIN. Legal grade (what cap is
  appropriate) ≠ structural ownership (who emits it). Adopt the law, refuse the (c).
- **Placebo-floor failure has a THIRD location**: mechanism (#677) → measurement (A1) → **inventory of what the
  measurement is over** (this round). An absent hazard in the 44-record bank is not an absent hazard.

Links: [[design-hardbar-pivot-v3-review]] [[design-move4-hardbar-floor-review]] [[gauntlet-hardbar-r1]].
