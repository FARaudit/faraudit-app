# Engine model fit review — every stage, every model (2026-08-02)

**What this is.** A per-role review of which model runs which part of the live V3 engine, and whether it is
the right fit. **What this is NOT: an empirical result.** `model-registry.ts` states its own contract —
"every swap (forced or opportunistic) is a config change here **+ a gold-set re-run** — never a code edit
scattered across the engine." No gold-set A/B was run for this document. So the output below is
**where the risk is and what to test**, never "switch this."

## Method (Rule 51 — name what was enumerated and how)

1. `grep -rnE '"claude-[a-z0-9.-]+"' src/lib agents` → every model literal in the repo (20 sites), then each
   traced to a consumer to separate live from dead.
2. `grep -rnoE 'modelFor\("[a-z]+"\)' src` → every registry-bound call site (24).
3. `grep -nE "model: *[a-zA-Z_\"]"` across the 10 agentic/audit modules → every parameterized call site,
   each traced back to its model source.
4. Resolved `modelFor(role)` **inside the deployed worker container** with the live env, not locally.
5. Model IDs validated against `/v1/models` **and** by a real 1-token call (list membership is not a
   validity test — `claude-haiku-4-5` is absent from the list yet resolves fine).

## The live map

Resolved in-container on the deployed worker, every override unset. Rule 17 parity confirmed on Vercel.

| stage | role | model | bound via |
|---|---|---|---|
| per-doc MAP extraction | `extractor` | `claude-haiku-4-5` | registry |
| **expert lens react-loop** (`audit-package.ts:199`) | `lens` | **`claude-sonnet-4-6`** | registry |
| overview / compliance / risks lenses | `lens` | `claude-sonnet-4-6` | registry |
| skeptic P2 base adversary | `lens` | `claude-sonnet-4-6` | registry |
| cross-doc pass (Stage 2.5) | `crossdoc` | **`claude-opus-5`** | registry |
| vision + table-vision confirmers | `crossdoc` | **`claude-opus-5`** | registry |
| skeptic P2 escalation (contested) | `judge` | **`claude-opus-5`** | registry |
| judgment reason (J-1) | `judge` | **`claude-opus-5`** | registry |
| judgment entailment verifier (J-2) | `judge` | **`claude-opus-5`** | registry |
| section finder (L3) | `finder` | `claude-sonnet-4-6` | registry |
| panel — Ex-KO Evaluator, Adversarial Verifier | panel `opus` | **`claude-opus-5`** | **panel-runner, NOT the registry** |
| panel — other seats | panel `sonnet` | `claude-sonnet-4-6` | **panel-runner** |
| panel — cheap seats | panel `haiku` | `claude-haiku-4-5` | **panel-runner** |

**Opus 5 runs 3 of 5 registry roles by call site, but the two highest-VOLUME stages — extraction and the
expert lenses — are not on it.** "The engine is on Opus 5" is not an accurate summary.

## Fit assessment

### Keep as-is

- **`crossdoc` / `judge` → Opus 5.** Deep reasoning and adversarial entailment; Opus 5 is price-neutral
  against Opus 4.8 ($5/$25 per MTok). Correct call, no change proposed.
- **`finder` → Sonnet 4.6.** L3 returns a verbatim anchor and a deterministic offset-string-match gate
  **rejects** a wrong locate, failing safe to INCOMPLETE. The gate, not the model, guarantees correctness —
  this is "max capability, not max model" applied correctly. No change.

### The two worth testing, in priority order

**1. `extractor` → Haiku 4.5. Never decided empirically, and it bounds everything downstream.**
The registry's own comment says: *"Haiku-vs-Sonnet for the extractor is DATA-DECIDED in Stage 4 (gold-set
A/B) — the default below is the starting hypothesis."* **Stage 4 appears never to have run.** An untested
hypothesis has been the production default since the registry shipped (2026-06-23).
Why it ranks first: the per-doc MAP is the compression boundary. A binding fact the extractor drops is
**unrecoverable** — no later stage, however capable, can analyze text it never received. That is the same
failure shape as the arc merged today (documents read in full, never analyzed) and as Rule 69
(cross-compression-boundary integrity). Cheapest possible test, highest possible leverage.

**2. `lens` → Sonnet 4.6, for the expert react-loop specifically.**
This is the "independent expert lenses" the moat statement leads with, and it is the one stage doing
long-horizon agentic tool-use — Opus 5's documented strength.
The counter-argument on file is that lens output is hard-gated by `isGrounded`, so a bad read fails safe.
**That argument is incomplete: the grounding gate catches FABRICATION, not OMISSION.** A lens that grounds
every claim it makes and simply *fails to raise* an obligation passes the gate cleanly. Nothing downstream
recovers the miss. Every defect this session — the free-passed amendments, the unanalyzed wage
determination — was an omission, not a fabrication.
Cost is the real trade: this is the highest-volume stage (N lenses × up to 8 turns each). Opus is 1.67×
Sonnet per token ($5/$25 vs $3/$15). A run is currently ≈$1.25–1.50.
**Proposed test, not a switch:** A/B the expert loop on Opus 5 vs Sonnet 4.6 against the gold set, scoring
**recall of planted-hard obligations** — the omission axis — not just verdict correctness.

## Defects found while enumerating

**D1 — There are TWO registries; the contract says there is one.**
`model-registry.ts` claims to be "the ONE place a role binds to a concrete model ID." It is not.
`agentic-panel-runner.ts:164` holds a second `modelFor` with its own defaults and its own env knobs
(`AUDIT_JUDGE_MODEL`, `AUDIT_PANEL_SONNET`, `AUDIT_PANEL_HAIKU`). **Consequence: a model swap performed "in
the registry, per the contract" silently misses every panel seat** — including the Adversarial Verifier,
the single truth choke-point. Either fold the panel tiers into the registry or state plainly in both files
that two registries exist.

**D2 — The panel's price table is 3× stale on Opus, and it drives a CEO cost ruling.**
`agentic-panel-runner.ts:77` prices opus at `in: 15, out: 75`. `audit-cost.ts:7` prices opus-4.8 at
`in: 5.0, out: 25.0`, and the registry comment confirms $5/$25 as verified live. The panel table is
pre-Opus-4.5 pricing. It feeds `_usageCostUsd` → `tot.cost` → the `PANEL_COST_GATE_USD` = $2.50 ceiling
(CEO ruling 2026-07-21), so **panel cost is over-reported ~3× on exactly the two Opus seats**, and the
`⚠ OVER $2.50 GATE` warning fires on phantom spend.
**Calibration — do not over-read this:** `overGate` only formats a log line; it does **not** abort a run.
Customer billing is unaffected — that path uses `audit-cost.ts`, which is correct. This is telemetry and a
spurious warning distorting a CEO cost decision, not an overcharge.

**D3 — Dead model pins still readable as live.**
`ai-client.ts:45` returns `claude-opus-4-7` and has **zero importers**. `audit-engine.ts:25` exports
`CLAUDE_MODEL = "claude-opus-4-8"`, consumed only by `callClaude` (line 1304) which is **not exported** —
V1 machinery. Both are greppable and neither runs; the worker boot banner was reading the second one and
misreporting the engine until it was fixed (PR #392).

**D4 — A customer-facing surface bypasses the registry entirely.**
`/api/rfi-response` calls `CLAUDE_MODEL` from `anthropic.ts` = `claude-opus-4-7`. RFI response drafting is a
Rule 54 pillar-2 feature ("clarification emails draft themselves"). It is not the audit engine, so it is
outside this review's scope to re-pin — but it is a customer-visible generation running on an older model
with no role binding and no override knob. Worth a decision, not a silent default.

## What would close this properly

The registry's contract already names it: a gold-set re-run per swap. The two candidates above are
**hypotheses with a stated failure mode**, not conclusions. Ranked by leverage: extractor first (a
compression-boundary loss is unrecoverable), expert-lens second (omission is invisible to the grounding
gate). Both need `scripts/audit-ai/test-gold-gate.ts` scored on **recall**, and both cost real money to
evaluate — a G2 decision.
