# Engine cost + coverage findings — 2026-08-05

Companion to `ENGINE-WALK-2026-08-05.md` and `ENGINE-DECIDE-AUDIT-2026-08-05.md`. **Do not re-derive
any of this.** Everything below is either measured from a live paid run or read out of source this
session. Where something is a hypothesis it says so, and where a hypothesis DIED it says that too —
the dead list is the most valuable part of this file, because each one cost real time.

---

## 0. The one-paragraph version

A paid run of **W911SG27BA002** cost **$4.92** and took **495.9s** to produce
`NEEDS_HUMAN_REVIEW`. Ingestion was not the problem — **52 of 52 documents came through as real
text, zero unreadable.** The expert lenses then read **17 of them**, and the judge correctly refused
to decide on a package it had not covered. **Stage 07 (the verdict) did not fail; it reported that
stage 06 had not done enough.** Everything else here is detail underneath that sentence.

---

## 1. The measured run — audit `e5f177aa`, usage event `284e5f7a`

| fact | value |
|---|---|
| documents posted / ingested / assembled | 55 / 51 / 52 (2,825,434 chars, lossless) |
| **read by expert lenses** | **17** |
| binding docs read but never analyzed | **45** (each named in the log) |
| obligations found → examined | 43 → **12** (`maxCandidates=12`) |
| findings / verdict | 54 · `NEEDS_HUMAN_REVIEW` · `honest_fail=true` · `documents_complete=false` |
| cost | **$4.9220** — sonnet-4-6 46 calls / $4.4252 · opus-5 6 calls / $0.4968 |
| tokens | input 51,899 · output 43,793 · **cache_write 992,418 · cache_read 630,562** |
| wall clock | 495.9s — SAM retrieval 61s · expert phase 184s · verify(P2) 110s · j1 8s |

**Cost is concentrated in one place.** At the engine's own multipliers (`audit-cost.ts:48-56`,
write 1.25×, read 0.10×): cache writes ≈ **$3.72**, cache reads ≈ **$0.19** — together ~**76% of
the run**. Opus, all six calls, is **10%**. Repricing or downgrading the opus roles cannot move the
number. The expert lens loop is **40 of the 46 sonnet calls and ~90% of run cost**.

Caching is still net-positive (~18% cheaper than flag-off). The claim is narrower: it delivers a
fraction of what an 8-turn loop should yield, and **the mechanism is still unidentified.**

---

## 2. Shipped this session

| PR | what | state |
|---|---|---|
| **#487** | token budget evicted the solicitation it was written to protect — two-pass core reserve | merged |
| **#493** | lens cost ledger could not tell one call from another — per-call `<lens>#<turn>` labels | merged |
| **#491** | lens `effort` is settable (`AUDIT_LENS_EFFORT`), default unchanged | merged |
| #486 | banked the Vercel arm record for the ingest ceilings | open |

**Armed on both Railway + Vercel, CEO-authorized in words:** `AUDIT_MAX_DOCS=60`,
`AGENTIC_MAX_FULLSOURCE_CHARS=3000000`, `AGENTIC_V3_PRIMARY_BUDGET_MS=900000`. Verified
in-container via `railway ssh printenv` on sha `7490fff3d1ae`.

⚠ **`AUDIT_LENS_EFFORT` is NOT armed.** And the risk runs the wrong way: at `low`/`medium` the model
makes "fewer and more-consolidated tool calls", and **every tool call a lens makes is a document it
opens**. A cheaper run that reads fewer documents is the known defect getting worse for less money.
**Any effort A/B must score `docsRead` and finding count alongside cost.**

---

## 3. DEAD HYPOTHESES — do not revive without new evidence

1. **Prime-then-fan-out to share the lens cache.** DEAD. `audit-expert.ts:299` builds `systemField`
   from the **per-lens** system prompt, so the five lenses do not share a prefix. The documented
   "N parallel requests with identical prefixes" rule does not bite. Only the tool-schema block is
   shared, and it may not even clear sonnet-4-6's 1024-token cacheable minimum.
2. **Batch API for 50% off.** DEAD. Batch cannot run a multi-turn tool loop — there is no way to
   execute a tool and feed `tool_result` back mid-batch. The expert phase is structurally
   ineligible. The one stage that looked batchable (the verifier) is already **one call**
   (`agentic-panel-runner.ts:580`: *"After bounding this is almost always ONE batch"*). Batch would
   save cents and cost up to an hour of latency.
3. **The 20-block cache lookback is causing the write/read inversion.** REFUTED by arithmetic. The
   breakpoint is re-placed on the last block every turn, so the lookback distance is only the newest
   batch (`2 × K`). An 8-turn run crosses 20 **only if a single turn issues ≥11 parallel tool
   calls** — possible, unmeasured, but not the general explanation.
4. **Accumulating `cache_control` breakpoints past the 4-per-request max.** REFUTED.
   `makeAnthropicCallModel` rebuilds `messages` fresh from `priorToolResults` on every call, so
   exactly 3 breakpoints are sent.

**Leading LIVE hypothesis for the inversion:** `tool_choice` is added only on the final turn
(`audit-expert.ts:314`, `forceSubmit`). Anthropic's invalidation hierarchy says a `tool_choice`
change **preserves tools+system caches and invalidates the messages cache** — so turn 8, carrying
the largest prefix of the run, cannot read it. Four of five lenses reached turn 8. **Unproven.**
Note the fix is not obvious: setting `tool_choice` every turn would destroy the react loop.

---

## 4. THE NEW LEAD — stage 04 routing switched itself off

Found at the very end of the session and **not yet investigated**. This is where the next session
should start.

From the live log:

```
[routing] sections routed: [B,C,L,M] · chars/lens: [B:2825434,C:2825434,L:12075,M:2825434]
          · fallback: WHOLE-SOURCE (#525 — a lens would be starved; legacy L&M predicate;
            each lens reads full source; cost-slope INFLATED)
[L3-finder] §M: anchor absent / too short / ambiguous in source (rejected) [REJECTED — fail-safe INCOMPLETE]
```

The chain, read out of source:

1. `AUDIT_COMMERCIAL_ROUTING_V2` is **false**, so `panel-adapter.ts:190` uses the **legacy
   predicate**: `routed` is true only when **§L AND §M are both placed**.
2. §M's anchor was rejected (`audit-section-finder.ts:122`).
3. One missing anchor ⇒ `routeOk = false` ⇒ **routing abandoned for every section**;
   `FALLBACK_BUNDLE_KEYS` each get the entire source.
4. Result: B, C and M each received **2,825,434 chars**; §L received **12,075** (from
   `ucfSectionText`, spread after `base`).

**Why this matters more than it looks.** §M is the evaluation criteria — how the bid is scored.
Losing it is a total loss on the most decision-relevant section, and no amount of reasoning quality
at stage 06 recovers a section that was never located. Separately, the whole-source fallback hands
each lens 2.8M undifferentiated characters against an 8-turn budget, which makes stage 06's coverage
problem **worse**, and the log itself says the cost slope is inflated.

**Scope boundary, so the next session does not overreach:** routing governs the **UCF sections**
(B/C/L/M). It does **not** govern the 45 binding attachments, which come through `read_document`
inside the 8-turn budget. Perfect routing would not by itself move `docsRead` off 17. Missing
sections and missing documents are two separate halves of one bad report.

**FIRST COMMAND NEXT SESSION ($0, read-only, no model call):** run the router against the banked
source for `W911SG27BA002` and print which anchors it locates and which it misses. That settles
whether this is a *predicate* problem (fixable by arming `AUDIT_COMMERCIAL_ROUTING_V2`) or an
*anchor-detection* problem (needs code). Prior report on record — **not re-verified this session** —
is that v2 is **inert on this package** because the router cannot locate §L either, which would make
the anchors the root.

---

## 4a. RESOLVED 2026-08-05 evening — the root is ONE WORD, and it is not the word §4 named

`scripts/audit-ai/_routing-anchor-probe.ts` (**$0** — SAM downloads only, no model call, no audit,
no paid run; the assembled source is cached so re-runs cost nothing) reassembles `W911SG27BA002`
through the worker's own entry points and prints every anchor's match positions. Reassembly
reproduces the live run closely enough to trust: **2,805,331 chars vs the live 2,825,434** (0.7%,
consistent with the package moving since 08-05), and the deterministic UCF slicer produces
`{L:12075}` — **byte-identical to the live log's `L:12075`**.

### What the anchors actually do

| | V1 (LIVE — `AUDIT_COMMERCIAL_ROUTING_V2=false`) | V2 |
|---|---|---|
| §L | **✗ ZERO matches in 2.8M chars** | ✓ first @ 2,148,115 (76.6% in) |
| §M | ✓ first @ 1,018,122 | ✓ same |
| §C | ✓ first @ 13,540 | ✓ same |
| §B | ✓ first @ 2,105,523 | ✓ first @ 1,859,337 |
| §I | ✓ first @ 1,416,699 | ✓ same |
| `placedKeys` | `[C,M,I,B]` | `[C,M,I,B,L]` |
| legacy predicate (`L AND M`) | **false** ⇒ whole-source fallback | **true** ⇒ routes |
| `commercialRoutingSafe` (#525) | **already true** | true |

**§4 attributed the fallback to §M. §M was fine.** §M placed under both anchor sets. The
`[L3-finder] §M: anchor absent / too short / ambiguous (rejected)` line in the same log comes from
`runSectionFinder` — the **L3 agentic finder**, a separate paid subsystem that locates §L/§M the
deterministic pass missed. Two different mechanisms, one log window. The router's failure was §L.

### The root

**This package is an Invitation for Bids, and the anchor set does not know the word "bidders."**

- `instructions to bidders` — **22 occurrences**, first at offset **29**
- `invitation for bids` — 20 · `\bbidder` — 293 · `\bIFB\b` — 23
- `instructions to offerors` — **0** · `instructions to quoters` — **0**

V1's §L anchor is `instructions? to (?:offerors|quoters)|submission (?:instructions|requirements)|
section l\b`. Sealed-bid vocabulary is absent from all three alternatives, so §L never places, the
legacy `L AND M` predicate goes false, and **routing is abandoned for every section** — which is how
B, C and M each came to hold the entire 2.8M-char package. One missing word, whole-package blast
radius. (`AUDIT_LOSSLESS_INGEST` is on, so this is not compression: the source is verbatim.)

### The prior report is REFUTED — but arming the flag is still not the fix

"v2 is inert on this package because the router cannot locate §L either" is **wrong**. V2 *does*
place §L and *does* flip `routed` false→true, cutting per-lens volume several-fold (C 1.94M→1.68M,
B 12.5K→273K, M unchanged at 466K, L 12K→43K).

It places it in **the wrong place.** V2's §L hit at 2,148,115 is inside FAR provision boilerplate —
*"the offeror must furnish with its offer a signed statement…"* immediately before `52.219-1` — not
the Instructions to Bidders, which begin at offset **29**. §M's only hit is worse: offset 1,018,122
is `509.2.3.4.1 ASR Mitigation Evaluation Criteria`, a concrete alkali-silica-reaction test
paragraph in a materials spec. **On an IFB there is no §M at all** — award here is *"to the
responsible bidder whose bid… will be most advantageous to the Government, considering only price."*
A §M anchor that "succeeds" on this package is a false positive by construction.

What keeps that from becoming a coverage regression is a **separately armed** flag:
`AUDIT_ROUTING_HEAD_COVERAGE=true` injects the 13,539-char pre-first-anchor head — which is where
the real Instructions to Bidders, the 9AM MDT 10 Sep 2026 bid opening and the award basis live —
into §A and §L. Verified at production parity: with head coverage on, V2 yields `L:43,453` (13,539
head + 29,912 misplaced clause slice) and `A:13,539`, so `source_selection_evaluator` [L,M] still
reaches the award basis. **Arming `AUDIT_COMMERCIAL_ROUTING_V2` on this package therefore works only
because a different flag is compensating for a misplaced anchor.** That is the exact shape
`routeCommercialSections`' own decision-isolation comment (`panel-doc-class.ts:183-188`) warns
about.

### The fix — SHIPPED in #499 (`1514f5ce`) and ARMED on both surfaces 2026-08-06

A positive-SHAPE anchor addition in the §L set, behind `AUDIT_IFB_SECTION_ANCHORS`. Shape allowlist,
never a vocabulary blocklist. Three header-like shapes: the SF-1442 heading, a line-start
`Instructions to Bidders:` title, and the UFGS section number `00 21 13`.

Two things changed between this section being written and the fix shipping, and both matter:

- **`invitation for bids` was DROPPED from the proposal above.** It is real IFB vocabulary, but it
  recurs mid-content on this very package — "conforming to the invitation for bids", "Also called
  Invitation for Bids." — so it would fragment §C mid-sentence, which is what this file's
  header-like-only anchor doctrine exists to prevent. `bid opening` was dropped for the same reason.
- **The heading shape had to cover OFFERORS too, and that is a SECOND defect.** The fix's own
  non-regression control was `INSTRUCTIONS, CONDITIONS, AND NOTICES TO OFFERORS` — the negotiated
  twin — and it FAILED ITS OWN PRECONDITION: the existing anchor wants `instructions to offerors`
  contiguous, and that heading puts three words between them. Construction RFPs on SF-1442 lose §L
  for exactly the reason IFBs do. Neither the run nor this section found that; the control did.

Measured on the real source with the flag on: §L places at offset **71**, `routed` flips to true, and
the dropped pre-first-anchor head falls from **13,539 chars to 71** — so the bid opening, award basis
and 8(a) set-aside move INSIDE §L rather than depending on `AUDIT_ROUTING_HEAD_COVERAGE` to carry
them. Zero match across all 17 banked sources carrying `input.fullSource`.

**Unchanged by any of this:** routing governs UCF sections, not the 45 attachments. This is a
cost-slope fix. It does not move `docsRead` off 17. **And it has not yet run:** the flag is armed but
no audit has been fired since, so the routed read has never actually reached a lens.

### One instrument mismatch found in passing

`commercialRoutingSafe` (the #525 predicate) evaluates starvation against
`LENS_SECTIONS_COMMERCIAL`, but that map is live **only** when `AUDIT_LENS_EMISSION_INTEGRITY` is
on — and that flag is **not set on the worker at all**. The live map is the UCF `LENS_SECTIONS`.
`anyLensStarvedUnderLiveMap` exists and reads the correct map; the predicate the router actually
consults does not. Both returned the same answer here (`false` / safe), so nothing is mis-decided on
this package — but the predicate is measuring a map production is not using.

---

## 5. Stage 06 — the expert loop, line by line

Ranked, from a dedicated read-only review. PROVED vs HYPOTHESIS marked.

1. **`maxTurns` is a `??8` default with no production caller** (`audit-expert.ts:57`). It threads
   through four files and **nothing ever sets it** — no flag, no env var. The most consequential
   number in the dominant cost/latency stage is a hardcoded fallback. **PROVED.**
2. **Three suppressors of reading stack on the same lens.** The 8-turn cap; the userTask at
   `:119-124` — *"Read ONLY the sections you need… Do not keep reading once you can state your
   findings"*; and the discovery notice at `:117` — *"ignore the rest."* Turns are shared across
   **all** tool types, so a lens spending 4 turns on sections has ~3 left for 45 attachments.
   17-of-52 is what that budget predicts. **Attribution between the three is UNPROVEN.**
3. **`temperature: 0` (`:313`) is fatal on any 5-series model.** Rejected with HTTP 400 on
   `claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-8/4-7`, `claude-fable-5`. Correct today only
   because `modelFor("lens")` resolves to sonnet-4-6. Three trigger paths: a registry re-route,
   `input.expertModel` (bypasses the registry), and the retry at `:338` which spreads `...req`.
   **Blast radius is the whole audit** — the five calls sit inside `Promise.all`, so one rejection
   rejects the paid run. **PROVED.**
4. **A clipped retry on the final turn silently zeroes a lens.** `max_tokens: 4096` with one retry
   at 8000 and no third attempt. If the retry also stops at `max_tokens`, the tool JSON is clipped,
   `findings` is null, and on turn 8 the lens returns `findings: [], converged: false, dropped: 0` —
   **indistinguishable from a lens that found nothing.** **PROVED (path), UNMEASURED (frequency).**
5. **`turns` cannot distinguish forced-submit from never-converged.** `:171` returns `turns: turn`
   (8 on a forced submit) and `:196` returns `turns: maxTurns` (also 8, with `converged: false`).
   The timing log prints only `turns`. **Do not report "N lenses were force-submitted"** — the
   evidence does not support it. **PROVED.**
6. **Every `read_document` executes twice**, and `parseDocRegions` is not memoized — it re-splits
   and rejoins the full 2.8M-char source on every call. ~39 full parses per run, inside the paid
   parallel phase. Deterministic, so no correctness impact; pure waste that scales with package
   size. **PROVED.**

---

## 6. Model routing — what runs where

| stage | file:line | role | model |
|---|---|---|---|
| OCR / rate-table vision confirm | `audit-executor-v3.ts:400`, `:439` | crossdoc | opus-5 |
| L3 section finder | `audit-package.ts:236` | finder | sonnet-4-6 |
| **expert lenses ×5** | `audit-package.ts:199` → `audit-expert.ts:328` | **lens** | **sonnet-4-6** |
| base skeptic | `audit-package.ts:210` | lens | sonnet-4-6 |
| tiered escalation | `audit-package.ts:214` | judge | opus-5 |
| J-1 / J-2 | `audit-package.ts:225`, `:226` | judge | opus-5 |
| panel lenses ×5 | `agentic-panel-runner.ts:452` | **second registry** | 3× sonnet · 1× opus · 1× haiku |
| adversarial verifier | `agentic-panel-runner.ts:587` | second registry | opus-5 |
| chief judge | `agentic-panel-runner.ts:643` | second registry | sonnet-4-6 |
| **`deriveVerdict`** | **`audit-decide.ts:3365`** | **none** | **no model — deterministic** |

**The lenses are NOT on Opus.** Correct this wherever it appears.

**Two registries, two env names.** `model-registry.ts:5` claims to be "the ONE place a role binds to
a concrete model ID"; `agentic-panel-runner.ts:167` is a second `modelFor` with its own knobs. The
judge tier is `AUDIT_MODEL` in the registry and **`AUDIT_JUDGE_MODEL`** in the panel.
`AUDIT_PANEL_SONNET` / `AUDIT_PANEL_HAIKU` have no registry counterpart. **A model swap made "in
the registry, per the contract" reaches 8 of 12 live call sites and silently misses all 7 panel
seats, including the Adversarial Verifier.**

**Dead:** `modelFor("extractor")` → haiku has **no live call site**. Its only live consumer would be
the Small-Business Eligibility panel seat (`agentic-panel.ts:315`), and the run recorded **zero
haiku calls** — consistent with the panel not firing at all, but **unproven** (a seat that fails
every retry contributes zero usage rows under `Promise.allSettled`, indistinguishable from one that
never ran). **$0 to settle: grep the banked ledger labels for `panel:`.**

---

## 7. Migration blockers — a `sonnet-5` bump breaks more than the lens loop

- `audit-expert.ts:313` — `temperature: 0` → 400.
- **`anthropic-structured.ts:111` gates on `/^claude-sonnet-/i`, which MATCHES `claude-sonnet-5`** →
  breaks the **shared structured path**: base skeptic, section finder, panel sonnet seats, chief
  judge, vision confirmers. `audit-engine.ts:1505` carries a third copy of the same regex (dead path
  today, latent).
- **`audit-cost.ts:6-9` — the CUSTOMER BILLING path — has no sonnet-5 entry**, and `priceKeyFor`
  maps any `sonnet` substring to `sonnet-4.6` at $3/$15. A sonnet-5 pin during the $2/$10
  introductory window (through 2026-08-31) would **overcharge by 50%**. Opus is fine.
- `agentic-panel-runner.ts:76-77` prices opus at `in:15, out:75` — 3× the real $5/$25. Feeds only
  the `$2.50 PANEL_COST_GATE_USD` warning, so that warning fires on phantom spend.
- Sonnet-5's tokenizer produces **~30% more tokens** for the same text, which largely cancels the
  33% introductory discount. **Net effect must be measured, never assumed.**

---

## 8. Unarmed / unexplored levers, ranked

1. **`AUDIT_ATTACHMENT_COVERAGE` is FALSE.** With it off, `bindingDocs = []`, so the pre-injection
   block at `audit-expert.ts:80-87` never runs and **no lens receives any document text** — every
   one falls through to a filename list. It is off because it stalled at a **270s** budget; the
   budget is now **900s**. Per harness memory the entailment gate is also dark behind this same
   flag. ⚠ Blanket pre-injection does not scale: measured p50 35,219 / **max 332,310** tokens per
   lens (176,095 across five at p50, via `_lens-02-discovery-live-inertness.ts` over 111 banked
   packages, fires on 105/111). W911SG27BA002 is near the **max** case — ~1.5M across five lenses,
   which will not fit. The bounded version pre-injects to ONE lens.
2. **Ownership routing.** `audit-lenses.ts:70-77` already declares each lens's *"EXCLUSIVE
   OWNERSHIP (no other lens covers these)"* — but **as prose in the system prompt, not as routing in
   code**. Turning it into a routing rule gives each lens the documents it owns at roughly a fifth
   of blanket cost. This is the "lens ownership map" already named as part of the Track 1 moat.
3. **`effort`** — now settable via `AUDIT_LENS_EFFORT` (#491), unarmed. See the coverage warning in §2.
4. **Context editing** (`clear_tool_uses_20250919`) — absent from the codebase. Directly attacks the
   transcript growth driving cache writes.
5. **Per-lens `cachedSystemPrefix`** at `agentic-panel-runner.ts:452` — in the unchunked case that
   call is made **once per lens**, paying a 1.25× write premium for a cache nobody reads. Strictly
   worse than not caching. The haiku seat's prefix likely no-ops entirely (4096-token minimum vs
   1024 for sonnet-4-6, 512 for opus-5).
6. **`strict: true`** is flag-gated off (`:216`, `:246`) despite a probe reportedly confirming
   acceptance. Arming it changes tool bytes at prompt position 0, invalidating the tool cache prefix.

**Other flags currently OFF on the worker:** `AUDIT_ABSENCE_RECONCILE`, `AUDIT_CHUNKED_INGEST`,
`AUDIT_COMMERCIAL_ROUTING_V2`, `AUDIT_COVERAGE_COHERENCE`, `AUDIT_FORCE_GROUNDING`,
`AUDIT_SITEVISIT_ELIGIBILITY`.

---

## 9. Everything below is answerable for **$0** from data already on disk

The banked run record persists per-call usage (`audit-run-record.ts:148`; `UsageCall` in
`audit-cost.ts:35-45` carries `label`, `ms`, `cache_read`, `cache_write`) **and** the full per-lens
per-turn tool trace (`audit-orchestrator.ts:191`, produced at `audit-expert.ts:174`). Until #493 the
labels were all `"expert"`, which is why none of this was readable. **From the next run they will
be.**

- which calls have `cache_read: 0` → names the stage causing the write/read inversion
- how often the `max_tokens` retry fires → count `+retry` labels (was: grep rotating worker logs)
- per-turn tool-call counts → settles whether any turn issued ≥11 parallel calls
- whether the panel fired at all → grep labels for `panel:`
- whether lenses were force-submitted or produced nothing → `converged`, which never reached the log

---

## 10. Process note, and it is the point

Three plausible, well-cited cost levers were proposed and killed in a single session (§3). Each
sounded right and cited real documentation; none was checked against this codebase's actual shape
before being said out loud. **That is the same failure mode the engine exists to prevent** — a
confident claim about a document is worthless until it is checked against the document. The engine
has grounding, an adversarial verifier and an honest-fail guard. The development process around it
had no equivalent gate, and the aggregate cost numbers were the only instrument anyone could read.
**#493 fixed the instrument.** Use it before proposing the next lever.
