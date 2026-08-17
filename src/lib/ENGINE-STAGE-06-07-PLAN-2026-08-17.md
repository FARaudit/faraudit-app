# Stage 06 (Reason) + Stage 07 (Verdict) — measured state and the forward plan

**2026-08-17. Everything here is measured at $0 from the two banked run records
(`scripts/audit-ai/run-records/_ua-3b5bba30.json`, `_ua-e5f177aa.json`) or replayed through the
production functions. No paid run was fired. Read this before touching stage 06 or 07.**

Companion artifact (published, now STALE — regenerate from this file):
`https://claude.ai/code/artifact/186ae7e9-dcb7-4550-a301-1d4e05f64540`

---

## The two runs this rests on

Same solicitation, W911SG27BA002 (Fort Bliss Paving IDIQ, 2.86 MB, 53 regions, 52 binding docs).
Their flag environments differ by **exactly one variable**, so the pair is close to controlled.

| run | date | flag delta | calls | cost | findings | uncovered | verdict |
|---|---|---|---|---|---|---|---|
| `e5f177aa` | 08-05 | `AUDIT_IFB_SECTION_ANCHORS` absent | 52 | $4.92 | 54 | 45 | NHR |
| `3b5bba30` | 08-06 | `AUDIT_IFB_SECTION_ANCHORS=true` (#499) | 117 | $11.96 | 40 | 44 | NHR |

**#499 raised cost 143% and calls 125%, cut findings 26%, and moved coverage by one document.**
Two runs of a nondeterministic pipeline are not proof, but a 2.4× cost increase is outside noise.

## Cost, at verified list prices, every dollar mapped to a stage

Opus 5 $5/$25 · Sonnet 4.6 $3/$15 · Haiku 4.5 $1/$5 per MTok; cache write 1.25×, read 0.1×.
**The repo's own `MODEL_PRICE_PER_MTOK` prices Opus at $15/$75 — 3× the real rate.** Billing is
right; the engine's self-reporting is not.

| stage | step | calls | cost | if uncached |
|---|---|---|---|---|
| **06** | 6.7 six panel seats | 60 | **$5.67** | $5.36 |
| 04 | section finder (L3) — one call, labelled only `structured call` | 1 | **$2.82** | $2.26 |
| **06** | 6.2/6.3/6.5 five expert lenses — *the only step that reads the solicitation* | 39 | **$1.52** | $2.95 |
| **06** | 6.8 adversarial verifier | 6 | $1.13 | $1.13 |
| 02/03 | OCR table confirm | 3 | $0.35 | $0.35 |
| **06** | 6.8b gatekeeper / synthesizer | 1 | $0.24 | $0.24 |
| 04 | section finder, small calls | 5 | $0.20 | $0.20 |
| 07 | judgment layer | 2 | $0.03 | $0.03 |
| | **total** | 117 | **$11.96** | $12.53 |

Stage 06 is **$8.56 of $11.96 (72%)**. Caching saves $0.57 net **only because the lenses subsidise
the rest** — on lenses it saves $1.43, on the panel it *costs* $0.31, on the finder it *costs* $0.56.
Real package size, measured with `count_tokens` (free): **752,546 tokens, 3.82 chars/token** — every
estimate built on 3.5 was 8.6% high.

---

## SETTLED — do not re-derive these

### 1. The panel fires, costs $5.67, and lands nothing
Gate replayed on both packages ($0, `buildPanelInputs`):

- `3b5bba30`: **`manifest.ok = true` → panel FIRES**, 67 paid calls. Of the 40 findings reaching the
  customer, **zero carry a panel seat name** (`panel-findings-bridge.ts:172,198` stamps
  `lens: p.name`, the display name — distinguishable from the lenses' snake_case keys by construction).
- `e5f177aa`: `manifest.ok = false`, missing `"submission instructions"` → panel suppressed, 0 calls
  — **and that run produced MORE findings (54 vs 40), not fewer.**

**Likely mechanism, visible in the same replay: `unroutedBinding = 305`.** Binding content routed to
no section reaches no lens, and by its own docstring a non-empty list **forces INCOMPLETE**. That
makes the judge verdict non-committal, and the executor's fold is gated on `COMMITTAL_JUDGE_VERDICT`
(`audit-executor-v3.ts:701`), so the rationale is skipped. The panel works, the honesty net correctly
declines to use it, the run pays anyway.

⚠ **A prior inference that the manifest gate suppressed the panel was WRONG** — the gate passed. The
replay is what caught it.

### 2. One lens is handed 2,098,225 characters
Routing log from the same replay:
`§C 2,098,225 · §I 407,517 · §M 117,682 · §B 12,518 · §L 12,075` chars —
against an **8-turn budget** and a **12,000-char section read cap**. Not a coverage shortfall to
tune; the assignment cannot succeed by arithmetic. Both packages classify
`documentClass: commercial` on a sealed-bid **construction IFB**, and 71 head chars are dropped
unread by every lens.

### 3. Extraction recall — measured twice, blind
Two independent labellers (Code + Brain, card 856) on `UFGS 31 11 00 Clearing and Grubbing`:
**36 of 36 rows matched; zero found by one and missed by the other** beyond three granularity splits
(Brain 39 rows, Code 36). Robust under either denominator:

| document | deterministic regex | learned model |
|---|---|---|
| §L (the one section the engine reads) | 41% | 34% — **union 66%** |
| UFGS spec (never opened by any lens) | **15–17%** | **0%** |

They agree on only **3 of 32** in §L — near-disjoint blind spots. The regex needs a duty verb in the
same fragment, so it loses deadlines, eligibility bars and every TAB table row; the model reads
tables but stops after 15 candidates. **Kill-gate marking did NOT converge (Code 5, Brain 22)** —
that number is not quotable yet. Labels: `ceo/ITEM3-groundtruth-sectionL.json`,
`ceo/ITEM3b-groundtruth-ufgs311100.json`.

Brain additionally caught three **source** defects: an unclosed editing bracket
(`Apply herbicide [at the rate of` — a binding duty with no rate), a missing subsection 3.3.2, and
two cross-document dependencies referenced as approved but defined nowhere.

### 4. The coverage denominator is the real ceiling
Segmenter reaches **99.9%** of package characters (**2,879 enumerable obligations**, a floor — 6
regions hit a 200-obligation cap). The completeness proof graded **48**. That is **1.7%**.
`required = ["L"]` — one section of fifty-three — because `buildManifest` only requires sections a
header regex located. The document proof runs, names all 44 uncovered docs, and is then compressed
into a boolean the live GATE_V2 branch **structurally never reads**; `gradeCoverageV2` has no
document parameter at all.

### 5. Other settled facts
- Adversarial verifier **rejected nothing** (input 39, rejected 0, dropped 0) at $1.13. Dedup was a
  no-op (40 → 40).
- The **free** deterministic sweep emitted **99** findings to the paid lenses' **34** — but only 5 of
  its 99 survived, against 34 of 34 from the lenses. Something upstream of the verifier discards the
  sweep's output wholesale; it is not the verifier and not the dedup, both measured as no-ops here.
- `judgmentCost` is `null` on the record — the judgment layer may not have run.
- **The section finder** pushed the entire 752,793-token package into a cache entry designed to be
  read by a *second* locate call. Only one locate ran, so it paid the 1.25× write premium for zero
  reads. It is anonymous in the ledger because the caller passes no label and
  `anthropic-structured.ts:97` defaults to `"structured call"`.
- 62% of the corpus **still refuses with coverage forced perfect** (31 of 50 banked records) — stage
  07 is independently broken, not merely starved.
- Rule 70 is armed and released **2 of 13** capped verdicts; the release label is computed
  bucket-wide, so one bid-bond item mutes nine releasable ones.

---

## THE PLAN — in this order, and NOT 6.1→6.9

Walking the stage-06 steps in sequence is nine repairs to a stage whose output is capped upstream.
That is the patchwork this analysis exists to stop.

1. **Instrument the panel.** Persist `PanelResult.fired`, the judge verdict, and a per-finding
   producer tag. A few fields on the run record — no behaviour change, no flag. Today `fired`
   appears **zero times** in the record, so "gated off" and "ran and produced nothing" are
   indistinguishable, and they need opposite responses. Until this exists, any keep-or-cut decision
   on 47% of the budget rests on one run plus inference.
2. **Fix the denominator (7.1 / 7.2).** Pass document coverage into the verdict gate as a
   first-class argument instead of a bypassed boolean; make `required` what the package *contains*,
   not what a regex *located*. This is what turns 1.7% into a real number.
3. **Fix routing (M2).** No step-level change in stage 06 matters while one lens receives 2M chars.
4. **Then, and only then, revisit the stage-06 steps** — several stop mattering once the proof can
   see the package.

**Cheap and unblocked right now:** label the section-finder call (ends the anonymous ledger); make
its cache conditional on a second call following (~$0.56/run of pure waste); sweep `maxTurns` at
8/16/24 against the banked records ($0, the only variable never tested — `opts.maxTurns ?? 8`,
nothing in production sets it, no env knob exists).

**Replacement, if the rebuild is scoped** (sourced research, card 813): deterministic per-document
extraction + schema-constrained model adjudication, batched. Costed on this package at
**~$1.46 Haiku / ~$4.37 Sonnet batched, against today's $11.96** for coverage going 3.5% → ~100%.
Retrieval and a bigger context window were both examined and **rejected on published evidence** —
on benchmarks where every document is load-bearing (our shape, 52 of 53 binding), retrieval *lowered*
accuracy 53%→46%, and full-context single-pass scores 11–13 against a human 56 on the closest
published analogue.

## ⚠ TWO OBJECTIVES, NOT ONE — CEO, 2026-08-17

**Cost matters AND the engine has to be demo-ready.** Those pull in different directions and the
ordering above optimises only for correctness. Read this before sequencing work.

The demo problem is not cost, it is that **the engine mostly cannot answer**. Across all 104
completed audits: 46 NHR, 15 INCOMPLETE, 38 BID_WITH_CAUTION, 5 legacy PROCEED — **zero plain BID,
zero NO_BID, zero INELIGIBLE.** A prospect watching a live run has a ~44% chance of being told
"we can't tell". That is the demo blocker, and it is *not* fixed by the denominator work, which
takes months.

**Fastest demo-visible wins, all cheap, all stage 07:**

1. **The bond-token mute.** Rule 70 released 2 of 13 capped verdicts because the release label is
   computed bucket-wide — on `3b5bba30`, 9 of 10 obligations qualified for release and the tenth
   ("bid bond guarantee shall render your bid non-responsive") muted all ten. **Clear that one item
   and this audit returns BID WITH CAUTION instead of NHR.** A bid bond appears on essentially every
   construction IFB, so this single regex is disarming the doctrine on the whole package class.
   Same filter mis-fires the other way: "or bond paper" muted a verdict on paper stock, while
   "performance bonds" (plural) does not match at all.
2. **The untyped-bar leak.** 64% of disqualifying findings are missing their type fields, mostly
   emitted by the engine's *own* deterministic detectors. Branch 5a fires first and answers with an
   engineering complaint **that leaks internal field names to the customer**, where the branch below
   it would have said "if your firm does not already hold this, it is a no-bid". Same verdict, one
   field apart — but one is demo-able and the other is not.
3. **Label the section-finder call + make its cache conditional** — ~$0.56/run of pure waste, and it
   ends the anonymous ledger. Cost win, no demo risk.

**Suggested reconciliation:** run the demo track (1–3) and the instrumentation (plan step 1) in
parallel — they touch different files and neither blocks the other. Hold the denominator rebuild
(step 2) and routing (step 3) until after a demo-ready verdict exists, because both are large and
neither changes what a prospect sees this month.

**What NOT to do for the demo:** do not make the verdict more committal by loosening the honesty
net. The engine's refusal to guess is the product claim (Rule 61 / Rule 54 pillar 3). Fix the
inputs and the mis-firing regexes; never the guard.

## Open rulings owed by the CEO
- Verdict output shape: `recommendation × confidence`, or keep the single word?
- When the sweep flags an obligation nothing grounded — cap at BID_WITH_CAUTION naming it, or hold
  at NHR? On 2,677 obligations that is a lot of named caveats.
- Kill-gate threshold — Code and Brain diverged 5 vs 22 on the same document.
