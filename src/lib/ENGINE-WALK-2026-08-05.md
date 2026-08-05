# ENGINE WALK — stage 1 to the verdict, 2026-08-05

The line-by-line walk the CEO asked for twice. One written verdict per stage, each answering three
questions: **what does it do · what proves it does that · what would we never see if it silently stopped.**

**Method (Rule 51 — name what was enumerated and how).** Traced the customer path from
`agents/audit-worker/worker.ts` forward by following actual imports and call sites, never by symbol
similarity. For each stage the entry symbol was read in source, then its reachability confirmed by
enumerating *importers* (`grep -rn <module> src agents scripts`, discarding type-only imports and
`*.test.ts`). Flag state read **in-container on the deployed worker**
(`railway ssh --service audit-worker "printenv …"`), not from a dashboard listing. Gate coverage
counted per stage by the stage's **real entry symbol**, not a generic token.

**Provenance of the numbers.** Worker deployed sha `a1787659` = `origin/main` HEAD at the time of the
walk. CI suites: `npx tsx scripts/audit-ai/self-audit.ts suites` → **142/142 pass**.

---

## THE LIVE PATH, AND WHERE THE STAGE MAP IS WRONG

`ENGINE-STAGE-MAP.md` lists 14 stages. **Three of them do not execute on the customer path.** They are
not disabled by a flag — they have no caller at all.

| stage map row | live? | evidence |
|---|---|---|
| `1` MAP per-doc extraction (`claude-haiku-4-5`) | **DEAD** | `mapDocument` has zero callers. Its only other entry, `makeChunkMapCaller` (`audit-executor-v3.ts:322`), sits in the `AUDIT_CHUNKED_INGEST` branch — `false` in-container, **and** short-circuited by `AUDIT_LOSSLESS_INGEST=true`, which is evaluated first. |
| `2` Lenses — overview / compliance / risk | **DEAD** | `runLenses` (`agentic-lenses.ts:538`) has zero callers. Two matches repo-wide, both comments. |
| `2.5` Cross-doc pass (`claude-opus-5`) | **DEAD** | Same function. There is no separate cross-doc call site. |
| `buildCompactMatrix` | **DEAD** | Same module; reachable only from `runLenses` and `scripts/audit-ai/test-agentic-ingest.ts`. |

`agentic-orchestrator.ts` imports `agentic-lenses` and `agentic-map` **type-only**
(`import { type LensSurfaces }`, `import { type MappedFacts, … }`), and nothing in `src/app`, `src/lib`
or `agents/` calls its runtime exports. The whole V2 ingest triple is reachable only from
`scripts/audit-ai/*` gates.

**Two consequences that matter.**

1. **`modelFor("extractor")` → `claude-haiku-4-5` has no live call site.** `ENGINE-MODEL-FIT-REVIEW.md`
   ranks "extractor → Haiku 4.5, never decided empirically, and it bounds everything downstream" as the
   **#1 test to run**. It bounds nothing today. Haiku is still live, but through the *panel* registry
   (Small-Business seat), not through this role. That A/B, as scoped, would measure a stage the customer
   never touches.
2. **The real stage 1 is deterministic and free.** `assembleFullSourceLossless`
   (`agentic-lossless-ingest.ts:75`) — drop provable drawing/sheet noise, keep every prose line verbatim,
   never summarize. No model, $0. The compression boundary Rule 69 is written about is *not* a model
   compressor on this path; it is a line filter.

### The path as it actually runs

```
worker.ts → executeAudit (audit-executor.ts:172) → executeAgenticPrimary (audit-executor-v3.ts:201)
  I-0  buildAgenticDocs                     deterministic  · PDF/AcroForm → docs[]
  I-1  assembleFullSourceLossless           deterministic  · $0   ← the real "stage 1"
  0a   confirmResidualTokens  (vision)      opus-5   · conditional on OCR residuals
  0b   gateRateTable          (table vision)opus-5   · conditional on a detected rate table
       → auditPackage (audit-package.ts:194) → runAgenticAudit (audit-orchestrator.ts:2443)
  L3   runSectionFinder                     sonnet-4-6 · only for missing UCF §A–M keys
  3    runAgenticExpert × 5 lenses          sonnet-4-6 · maxTurns 8, parallel
  P1.4 panel findings merge (re-grounded)
  P1.5 highSignalSweep                      deterministic
  5    runJudgmentProducer  (J-1)           opus-5
  4    verify → sharded skeptic             sonnet-4-6
  4b   tiered escalation                    opus-5
  5b   runJudgmentVerifier  (J-2)           opus-5  · universalDefect-marked findings ONLY
  6/6b/6c panel (5 seats + adversarial verifier + chief judge), concurrent with stage 3
  7    deriveVerdict (audit-decide.ts:3365) NO MODEL · 34 exits
```

---

> **CLOSED THE SAME DAY.** PR #473 split the guard onto its own flag; merge `12e43884`. Both
> `AUDIT_CLAIM_ENTAILMENT` and `AUDIT_PERSONA_DIVERSITY` were **armed on CEO word 2026-08-05** and verified
> in-container on worker sha `12e43884`: `claimEntailmentEnabled()=true`, `entailmentFail` present in the
> response schema, the prompt no longer says "Challenge ONLY the classification", and lens 0 carries its
> EXCLUSIVE ownership block. `AUDIT_ATTACHMENT_COVERAGE` stays **false** — which is the whole point: the
> guard is on, the 270s pre-inject is not. The section below is kept as the diagnosis, in the tense it was
> written; read it as history, not as current state.

## THE HEADLINE FINDING — the claim↔excerpt entailment gate is built, proven, and dark

Rule 64 states its own known limit: grounding "confirms the EXCERPT is in the document — it does **not**
confirm the CLAIM says what the excerpt says," and names run `eab43ada`, which published a fabricated
`$29.99` wage gate whose own grounding excerpt read *"It is not a Wage Determination."*

**The mechanism that closes that gap exists.** The skeptic's `entailmentFail` signal (card #372/#373):
a first-class flag on any finding whose `requirement` asserts something its own `excerpt` does not
support, hard-dropped in `makeAgenticVerifier` **before** the re-type branch, so a corrected type can
never resurrect it.

**It is off in production, and not by its own flag.** All three of its parts are gated on
`ATTACHMENT_COVERAGE_ENABLED` = `AUDIT_ATTACHMENT_COVERAGE`, confirmed **`false` in-container**:

- `audit-verifier.ts:317-321` — the two ENTAILMENT instructions are omitted from the skeptic system prompt.
- `audit-verifier.ts:341` — `entailmentFail` is omitted from the response schema, so the model *cannot*
  return it.
- `audit-verifier.ts:99` — `if (ATTACHMENT_COVERAGE_ENABLED && v?.entailmentFail === true)` never fires.

What the live skeptic is actually told, verbatim from the flag-OFF prompt assembly
(`audit-verifier.ts:322`):

> `Challenge ONLY the classification.`

An explicit instruction *not* to ask whether the excerpt supports the requirement.

**The other entailment path does not cover this.** J-2 (`runJudgmentVerifier`,
`audit-judgment-layer.ts:218`) is live on opus-5, but its first act is
`if (!marked) { out.push(f); continue; }` — it only runs on findings J-1 marked
`contradictory_mandatory_terms` / `unmeetable_by_any_offeror`. It is a universal-defect verifier, not a
general entailment gate.

**So: no live stage checks whether a finding's requirement follows from its excerpt.**

**The mechanism works.** Run at prod parity `_prove-card373.ts` reports
`ALL PASS — Card #373 Option-1, flag-OFF side` — i.e. it certifies the guard is *inert*. Forced ON:

```
AUDIT_ATTACHMENT_COVERAGE=true npx tsx scripts/audit-ai/_prove-card373.ts
```

→ `ALL PASS (0 failed) — flag-ON side`, 7 assertions including *"entailmentFail DOMINATES upheld:true +
full corrected → DROPPED (branch order locked)"*.

**Why it is dark, and why that is the decision.** `AUDIT_ATTACHMENT_COVERAGE` also switches on the
coverage-lens pre-inject — handing one lens the full text of every binding attachment. That is what blew
the 270s budget on live runs `6cbabeae` and `e63a9b2d` (`audit-expert.ts:73-79`). The entailment gate was
turned off as collateral damage in a performance rollback. **One flag arms a correctness guard and a
known wall-clock regression together.** Splitting them is a code change, not a flag flip — and arming
`AUDIT_ATTACHMENT_COVERAGE` as it stands would re-introduce the stall.

> One gate comment is stale and reads the wrong way round: `_prove-card373` E5 prints *"guard live in
> prod."* It is not live in prod.

---

## STAGE VERDICTS

Coverage counts below are per the stage's **real** entry symbol —
`grep -rl "\b<symbol>\b" scripts/audit-ai/*.ts` (hand-run) and `src/lib/*.test.ts` (CI).
**CI's `suites` leg reads `src/lib/*.test.ts` only** (`self-audit.ts:31`, `readdirSync(LIB)`), so every
`scripts/audit-ai/` gate runs only when someone remembers.

| stage | entry symbol | hand-run gates | CI suites |
|---|---|---|---|
| 0a | `confirmResidualTokens` | 0 | 1 |
| 0b | `gateRateTable` | 0 | 1 |
| I-1 | `assembleFullSourceLossless` | 0 | 1 |
| L3 | `runSectionFinder` | 1 | 0 |
| 3 | `runAgenticExpert` | 4 | 4 |
| 4 | `makeAgenticVerifier` | **7** | **0** |
| 4 | `makeShardedSkeptic` | 1 | 0 |
| 4b | `makeTieredSkeptic` | 4 | 0 |
| 5 | `runJudgmentProducer` | 1 | 0 |
| 5b | `runJudgmentVerifier` | 1 | 0 |
| 6 | `runPanelJudge` | 3 | 2 |
| 7 | `deriveVerdict` | **132** | **35** |

The shape the RESUME predicted is real and it is stark: **stage 7 carries 132 hand-run gates and 35 CI
suites; the entire front of the engine carries 0–1 each.** The adversarial verifier — the stage that
decides which findings survive — has **seven gates, none of which run on a push.**

### I-0 · Document assembly — `buildAgenticDocs`

- **Does.** Turns the notice body + primary + attachments into `docs[]`. AcroForm field recovery is live
  (`AUDIT_INGEST_ACROFORM_FIELDS=true`) — this is the SF-1449 value path.
- **Proves.** `_acroform-01..04` gates; the `<200 non-whitespace chars` hard-throw at
  `audit-executor-v3.ts:342` means a total extraction failure is a terminal error, not an empty report.
- **Silent stop.** A *partial* extraction. The 200-char floor catches nothing but total failure; a doc
  that yields a header and loses its body passes as read, and every downstream stage inherits the loss
  with no signal. This is the class all three of yesterday's defects landed in.

### I-1 · `assembleFullSourceLossless` — the real stage 1

- **Does.** Fits under 3M chars → untouched whole read. Over → drop only whole-line provable noise
  (`NOISE_SHAPE`), keep every prose line verbatim. Still over → drop **whole docs, named** →
  `documents_complete=false`.
- **Proves.** `agentic-lossless-ingest.test.ts` (CI). The design is falsifiable by construction: a
  binding obligation is prose, and prose is never dropped.
- **Silent stop.** It cannot fail silently *downward* — the fallback is honest INCOMPLETE. But
  **`runGiantPerDoc` has no production caller** (only its own test), so the per-document read path the
  module's own comment says "should intercept BEFORE here" does not exist. A genuinely giant prose
  package is declared INCOMPLETE rather than audited per-document. Honest, and a capability gap.

### 0a / 0b · OCR vision confirm — `confirmResidualTokens`, `gateRateTable`

- **Does.** Gives an OCR-held binding doc one independent opus-5 vision re-read. 0a flips `has_text` only
  on an exact confirm; 0b appends only exactly-confirmed wage rows, and never flips `has_text`.
- **Proves.** `ocr-accuracy-gate.test.ts`, `ocr-table-gate.gauntlet.test.ts` (CI). Both fail toward
  content-loss: a missing API key, a missing base64, or an ambiguous name leaves the doc held.
- **Silent stop.** Nothing visible. A skipped confirm reads as "held content-loss" — indistinguishable
  from a genuine failure to confirm. Both paths log, neither is counted. Zero hand-run gates.

### L3 · `runSectionFinder`

- **Does.** Only when the deterministic manifest reports a UCF §A–M key missing, asks the finder for a
  verbatim anchor, then verifies it is **substantive and unique** in source and partitions to the next
  anchor.
- **Proves.** `test-layer3-section-finder.ts` — 23/23 at prod parity. The gate is the offset match, not
  the model: `locateUniqueAnchor` returns −1 on a second occurrence, so ambiguity is rejection.
- **Silent stop.** Sections stay missing → `coreMissing` non-empty → INCOMPLETE. Fails safe.

### 3 · `runAgenticExpert` — the expert react loop

- **Does.** Five lenses in parallel, sonnet-4-6, ≤8 turns, `forceSubmit` on the last. Every finding is
  hard-gated by `isGrounded` (verbatim substring) before it is accepted.
- **Proves.** 4 hand-run + 4 CI. `grounding-backstop` telemetry now separates "model invented an excerpt"
  from "backstop deleted text the lens genuinely read."
- **Silent stop — two live gaps.**
  - **`AUDIT_PERSONA_DIVERSITY` is unset (OFF).** `auditLenses()` therefore returns the base specs, so
    the five lenses have overlapping checklists and no exclusive ownership. Card 81 step 3 was built
    specifically to end the shared-miss failure mode; it is shipped and not armed. All five lenses can
    miss the same obligation and nothing records that they agreed.
  - **The grounding gate catches fabrication, never omission.** A lens that grounds everything it says
    and simply fails to raise an obligation passes cleanly, and no later stage recovers it. This is
    `ENGINE-MODEL-FIT-REVIEW.md`'s point 2, and it is the correct one to keep — it survives the walk.
  - Lens discovery **is** armed (`AUDIT_LENS_DISCOVERY=true`, verified in-container) and `read_document`
    is correctly exposed: `auditToolsFor()` adds it when **either** coverage or discovery is on. That
    wiring is sound.

### 4 / 4b · `makeAgenticVerifier` → sharded skeptic → tiered escalation

- **Does.** Re-grounds deterministically, selects the knife-edge subset, challenges, and classifies every
  ruling. Soundness requires ≥1 survivor **and** zero unresolved verdict-driving residue; otherwise NHR.
- **Proves.** 7 hand-run gates, **0 CI**. Run at prod parity: `test-verifier` 23/23,
  `_cert-sharded-verifier-DRY` 14/14, `_cert-r1-verifier-ledger` pass, `test-card274` 19/19.
- **Silent stop.** The **entailment hole above** — this is the stage that would catch a fabricated
  requirement on a real quote, and in production it is instructed not to look.
- **A caution about running these gates.** `test-card285-verifier-residue` goes **red at production flag
  parity and green in a clean environment** (20/20). It asserts the flag-OFF residue rule, which
  `AUDIT_VERIFIER_SHARDED=true` legitimately supersedes. Same for `test-layer1-notice-body-ingest`:
  7 failures at parity, **24/24 clean**. These are stale baselines, not defects — see the warning below.

### 5 / 5b · J-1 / J-2 judgment layer

- **Does.** J-1 proposes universal-defect findings from gap candidates; J-2 runs a 3-state entailment
  contract against the finding's own excerpt plus a 2,000-char window. VERIFIED writes `verifiedBy`;
  REFUTED strips the mark; UNVERIFIABLE leaves the NHR wall standing.
- **Proves.** 1 hand-run gate each, 0 CI. A boot-time coupling lock throws if the layer is on without
  `AUDIT_ELIGIBLE_TRISTATE` — both are on.
- **Silent stop.** J-2 falling through returns findings unchanged with the mark intact-but-unverified →
  `isVerifiedUniversalDefect` false → NHR. Fails safe. **But its scope is narrow by design** — it is not
  the general entailment gate, and should not be cited as one.

### 6 / 6b / 6c · The panel

- **Does.** 5 seats → adversarial verifier → chief judge, concurrent with stage 3
  (`AUDIT_PANEL_PARALLEL=true`). Contributes **findings**, never a verdict — `deriveVerdict` stays sole
  authority. Three structural floors override the judge's own output: `enforceVerifiedFloor`,
  `enforceVerifiedShowStoppers`, `enforceCoverageFloor`.
- **Proves.** 3 hand-run + 2 CI. The floors are pure functions and individually gate-testable — the right
  shape: a prompt asking the gatekeeper to escalate was proven insufficient (6E), so the escalation is
  structural.
- **Silent stop.** A panel throw degrades to panel-off and the rail proceeds on lens findings alone
  (`audit-executor-v3.ts:600`). Deliberate — the panel must never block a paid audit — but it means a
  permanently-failing panel is invisible in the verdict. The only trace is one log line.
- **Two known defects still open, both confirmed present.**
  - **Two registries, one contract.** `model-registry.ts` claims to be "the ONE place a role binds to a
    concrete model ID." `agentic-panel-runner.ts:167` is a second `modelFor` with its own env knobs. A
    swap made "in the registry, per the contract" misses every panel seat including the Adversarial
    Verifier.
  - **The panel price table is 3× stale on Opus.** `agentic-panel-runner.ts:76` prices opus at
    `in: 15, out: 75`; the real figure is `$5/$25` (`audit-cost.ts`). It feeds the `$2.50`
    `PANEL_COST_GATE_USD` warning, so that warning fires on phantom spend. Customer billing is
    unaffected — that path uses `audit-cost.ts`, which is correct.

### 7 · `deriveVerdict` — pure TypeScript, no model

- **Does.** Consumes a frozen `VerdictInputs` snapshot and returns one of 34 exits.
- **Proves.** Census re-derived mechanically over `audit-decide.ts:3365-3924`, exact:
  **NHR 17 · INCOMPLETE 7 · BID_WITH_CAUTION 5 · NO_BID 2 · BID 2 · INELIGIBLE 1 = 34
  (27 decline : 7 commit).** `ENGINE-STAGE-MAP.md` is accurate here. 132 hand-run gates + 35 CI suites.
- **Silent stop.** It cannot stop silently — it is synchronous and deterministic, and
  `EngineInvariantError` converts a misconfiguration into a billing-safe terminal failure *before* any
  persist or charge. The snapshot discipline is correct and load-bearing: `inputs` holds copies, so the
  post-verdict citation and head-regrounding passes cannot travel into the banked record and re-decide a
  replay.

---

## ⚠ THE GATE CORPUS IS BASELINED OFF-PRODUCTION

The RESUME says to run hand-written gates "ONLY with production flag parity or you get false reds." The
walk found the inverse is also true, and more often: **many gates assert flag-OFF behaviour, so
production parity is what turns them red.**

**Measured.** 130 of the 136 `test-*` / `_cert-*` gates are offline-safe (no API key, Supabase client,
`fetch`, or Railway call). Each was run twice at worker sha `a1787659` — once clean (CI-equivalent), once
with `AUDIT_*=true` sourced from the live worker:

| | clean env | production parity |
|---|---|---|
| red | **10 / 130** | **21 / 130** |

**19 gates flip between the two configurations** — 15 green→red at parity, 4 red→green. Only **6 are red
both ways**, and three of those are harness failures, not engine reds:

- `_cert-525-routing-629` — `fixture fetch failed` (needs network).
- `_cert-unit6-realrecord`, `_cert-unit6cf-realrecord` — `ENOENT /tmp/seq2-runrecord.json`; they consume
  an artifact a prior gate writes, so they cannot pass standalone.

The remaining three red-both-ways are exactly the RESUME's known **RULING OWED** set —
`test-construction-detector`, `test-loader-routing`, `test-eligible-tristate`. **The sweep found no new
engine red.**

**What the flips mean.** A red from this corpus carries no information until it is run both ways, and a
clean-env green is not evidence about the shipping engine. Worked example, and it is not a small one:
`test-derive-verdict` — the stage-7 gate — is **51/54 at production parity, 54/54 clean**. Two of its
three parity failures are the U5b signature already on the ruling docket:

```
❌ open-world (null profile) stays eligible:true : got null, exp true
❌ firm PROVABLY holds the OEM attribute → BID   : got NEEDS_HUMAN_REVIEW, exp BID
❌ same bar, firm qualifies → BID                : got NEEDS_HUMAN_REVIEW, exp BID
```

`AUDIT_ELIGIBLE_TRISTATE=false` clears the first and **leaves the other two**. So the U5b ruling touches
**three** gates, not the one the RESUME names.

**The residual pair was chased to ground and it is a stale baseline, not a defect.** Bisecting all 130
production flags one at a time names a single culprit: **`AUDIT_PROFILE_SCHEMA_V2`**. Under it,
`profileAttrSatisfiable` (`audit-decide.ts:2946`) refuses to let a *self-asserted* attribute satisfy a
floored namespace — `oem` and `naics` are both in `AUTHORITATIVE_ONLY_NS` — so an open-world profile
carrying `satisfiedAttributes: ["oem:dillon-approved-source"]` with no provenance record falls to
`unknown` → NHR with the 206-A verify-caution. The gate's fixtures are pre-v2: they assert a bare token
and expect it to clear.

**That is the CERT-PROVENANCE ruling, and production has already answered it.** The strict answer is
armed, and — checked, because a strict floor with no producer would mean every real customer's
certifications sat inert inside a paid audit — the producer exists and is wired: `cert-sync.ts`
(`syncCertifications`) derives authoritative `sam_api` records into `capability_statements.attributes_v2`
from both `/api/certifications` and `/api/capability-statement`, and `/api/audit` + `watcher-tick` read
that column. **The loop is closed on the live path.** CERT-PROVENANCE can likely come off the
rulings-owed list; the three gates need re-baselining to v2.

> Method note, kept because it nearly produced a fabricated number: the first sweep reported 130/130
> failing. macOS ships no `timeout(1)`, so every invocation returned exit 127 before `npx` ran. The
> harness was broken, not the gates. Verify the verifier before the finding.

---

## WHAT THIS WALK CHANGES

1. **`ENGINE-STAGE-MAP.md` rows 1, 2, 2.5 and `buildCompactMatrix` describe code with no caller.** They
   should be marked DEAD or removed, and the real stage 1 (`assembleFullSourceLossless`) named.
2. **`ENGINE-MODEL-FIT-REVIEW.md`'s #1 ranked test is void as scoped** — the extractor role has no live
   call site. Its #2 (expert lens, omission axis) survives the walk intact and is now the top candidate.
3. **The entailment gate is the engine's largest open correctness gap**, and the fix is not a flag flip:
   `AUDIT_ATTACHMENT_COVERAGE` must be split so the entailment signal can arm without the pre-inject
   stall.
4. **Persona diversity is shipped and unarmed**, leaving the five lenses homogeneous — the exact
   shared-miss shape the omission gap depends on.
5. **The engine's watched surface is inverted.** Stage 7 — deterministic, no model, cannot silently
   stop — carries 167 of the checks. The reading stages, where every recent defect landed, carry almost
   none, and none of the verifier's seven gates run on a push.
6. **The U5b ruling blocks three gates, not one.** `test-derive-verdict` carries the same signature as
   `test-eligible-tristate`, and two of its three parity failures survive turning the tristate off.
7. **No new engine red was found.** 130 gates, both configurations, worker sha `a1787659`: the only
   red-both-ways engine failures are the three already on the ruling docket.

8. **CERT-PROVENANCE looks already answered in production** — `AUDIT_PROFILE_SCHEMA_V2` is armed and
   `cert-sync.ts` is its wired producer. Three gates are baselined pre-v2 and expect self-assertion to
   clear a floored namespace.

## What is NOT settled here

- Whether the 19 flipping gates should be re-baselined to production or kept as OFF-side certificates.
  That is a doctrine call about what the corpus is *for*, and it is the CEO's.
- Nothing in this walk was verified by a paid run. Every claim above is from source, in-container flag
  reads, and $0 gates. **Stage behaviour under real model output is unproven by this document.**
