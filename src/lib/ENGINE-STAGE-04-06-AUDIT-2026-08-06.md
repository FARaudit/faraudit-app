# Stage 04 (Triage) + Stage 06 (Reason) — line audit, 2026-08-06

Ordered by the CEO before any further test fire. Read against `main` at `f92de975` in a clean
worktree — **not** the primary checkout, which was 4 commits stale and would have audited pre-merge
code.

**What was enumerated, and how.** Stage boundaries were taken from `ceo/engine-blueprint.html`'s own
id/label pairs (`04 · Triage`, `06 · Reason`), not assumed. Files: stage 04 =
`panel-doc-class.ts` (261) · `panel-adapter.ts` (228) · `section-boundary-detector.ts` (483) ·
`audit-section-finder.ts` (193) · `agentic-sections.ts` (679); stage 06 = `audit-expert.ts` (399) ·
`agentic-panel-runner.ts` (733) · `agentic-panel.ts` (344). `audit-expert.ts` and the stage-04
routing path were read in full, line by line. `agentic-panel-runner.ts`, `agentic-sections.ts` and
`section-boundary-detector.ts` were read in full at their control-flow and request-construction
regions and scanned symbol-by-symbol elsewhere — **stated plainly rather than claimed as complete.**

Findings that were already banked in `ENGINE-COST-COVERAGE-FINDINGS-2026-08-05.md` §5 are not
repeated. Everything below is new, or is an existing finding whose **severity changed** once it was
checked against the live API.

---

## P0-1 — `AUDIT_LENS_EFFORT=xhigh` would fail every paid audit. VERIFIED LIVE.

`audit-expert.ts:337` accepts five effort levels:

```ts
const EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
if (lensEffort && EFFORT_LEVELS.has(lensEffort)) req.output_config = { effort: lensEffort };
```

`modelFor("lens")` resolves to **`claude-sonnet-4-6`** (`model-registry.ts:21`). Queried against the
live Models API (a metadata GET — no generation, $0):

| model | low | medium | high | **xhigh** | max |
|---|---|---|---|---|---|
| `claude-sonnet-4-6` | ✓ | ✓ | ✓ | **✗ false** | ✓ |
| `claude-opus-5` | ✓ | ✓ | ✓ | ✓ | ✓ |

`xhigh` arrived with Opus 4.7 and is **not supported on the model the lenses actually run**. The
guard is not a typo-guard against this: `xhigh` is a *real* level, so it passes the allowlist and is
rejected by the API. Combined with P0-2 below, one 400 rejects the entire paid run.

**Why the shipped gate did not catch it.** `lens-effort.test.ts` drives a **stub client** and asserts
only that the field reaches the request object. It proves the request *shape*; it cannot prove the
API *accepts* it. The gate's own comment claims "a typo degrades to today rather than to an API 400
on an unknown enum" — true for `xhigh1`, false for `xhigh`.

**Fix:** intersect the allowlist with the resolved model's capability rather than hardcoding five
levels — the Models API publishes `capabilities.effort.<level>.supported` and the check is free.
Minimum viable fix: drop `xhigh` from the set while the lens is sonnet-4-6.

---

## P0-2 — The lens fan-out is the only unprotected concurrent stage in the engine

`audit-orchestrator.ts:2535`:

```ts
const runs = await Promise.all(experts.map((spec) => runAgenticExpert(spec, ctx, {...})));
```

`Promise.all` rejects on the first rejection. **Any** single-lens failure — an API 400, a transient
5xx, a malformed tool response — discards the other four lenses' completed work and fails the whole
audit.

The same stage's other half does the opposite. `agentic-panel-runner.ts:457` and `:467` use
`Promise.allSettled`, and the verifier at `:585` uses `Promise.all` over elements that each carry
their own `.catch()`, so it cannot reject. **Two halves of stage 06, opposite failure semantics** —
the panel degrades, the lens fan-out does not.

This is what converts every other finding here from "one lens is degraded" into "the paid run is
lost". It is also why P0-1 is P0 rather than P2.

**Fix:** `Promise.allSettled` with per-lens degradation. The coverage machinery already handles a
missing lens honestly (fewer sections read ⇒ INCOMPLETE), so the safe path exists — it is simply not
reachable today.

---

## P1-3 — `temperature: 0` is a live trip-wire on the model-override path

`audit-expert.ts:339` sends `temperature: 0` unconditionally. Per the current API reference,
`temperature` is **removed and returns 400** on Opus 5, Fable 5, Opus 4.8 and 4.7, and a non-default
value is rejected on Sonnet 5. It is accepted on Sonnet 4.6 — so production is correct **only**
because of the registry pin.

`model-registry.ts:40` exposes `AUDIT_LENS_MODEL` as an env override. Setting it to any 5-series
model — the obvious "upgrade the lenses" move — produces a 400 on every lens call, and P0-2 turns
that into a dead run. The banked §5.3 finding said this; what is new is that the **override
mechanism making it one env var away** sits in the same file.

*Basis: the documented support matrix. Unlike P0-1 this could not be probed — the Models API exposes
`effort` but not sampling-parameter support (`capabilities` keys are batch, citations,
code_execution, context_management, effort, image_input, pdf_input, structured_outputs, thinking).*

---

## P1-4 — A lens that reads and submits in the same turn has the read silently discarded

`audit-expert.ts:379-397`:

```ts
const toolUses = (resp.content ?? []).filter((b) => b.type === "tool_use");
const submit = toolUses.find((b) => b.name === "submit_findings");
if (submit) { ... return { toolCalls: [], findings: f as RawFinding[], attestations }; }
```

Parallel tool use is on by default, so one assistant turn may contain `read_document` **and**
`submit_findings`. When it does, `toolCalls: []` discards every sibling call. The loop's recorders at
`:184` and `:191` never run for that turn, so:

- the document is absent from `docsRead`
- its attestation is therefore dropped by the `:178` filter (which requires `docsRead.has(...)`)
- the section is absent from `sectionsRead`

The failure direction is **safe** — an uncounted document reads as uncovered ⇒ INCOMPLETE, never a
false COMPLETE. But it silently understates coverage, and it inflates the very number this arc is
chasing: **`docsRead=17` is a floor, not a measurement.** Frequency is unmeasured; the trace cannot
answer it because of P2-5.

---

## P2-5 — The per-turn trace never records the turn that submits

`trace.push({turn, tools})` sits at `:182`, *after* the `if (out.findings) { … return … }` block at
`:142-180`. The submitting turn therefore never reaches the trace.

The banked findings §9 lists "per-turn tool-call counts" as answerable for $0 from this trace. It is
answerable for turns 1..N-1 only. Combined with P1-4 — where the dropped sibling calls are precisely
the ones on a submitting turn — **the instrument is blind to exactly the event P1-4 describes.**

---

## P2-6 — Seeded documents are marked read without the model reading them

`audit-expert.ts:84-91` (the `AUDIT_ATTACHMENT_COVERAGE` path) pre-injects each binding document's
full text and marks it `docsRead` on the grounds that "we provably provide the WHOLE text".

That is a claim about **delivery**, not about **analysis**. `docsRead` feeds the attestation gate and
the coverage counters, so on this path coverage counts documents placed in the transcript rather than
documents the lens engaged with. This is the same conflation already recorded as *coverage measures
ingestion, not analysis* — it is noted here because it is a property of **the exact flag currently
under consideration for arming**, and it makes that flag's coverage numbers read better than the
reading behind them.

The pre-injected text is also replayed on every turn (`:280-284` rebuilds `messages` from all of
`priorToolResults`), which is the mechanism behind the two 270s stalls, not merely a correlate.

---

## P2-7 — `read_document` executes two to four times per logical call

- `:192` runs the tool to record `docsRead`, then `:202` runs **every** tool call again to build the
  transcript batch — so each `read_document` executes twice.
- `:178` runs it twice more per attestation (once in `.filter`, once in `.map`).

Deterministic, so there is no correctness impact; it is waste inside the paid parallel phase that
scales with package size. Same family as the banked `parseDocRegions` non-memoization.

---

## Stage 04 — Triage

**No new defect of P0/P1 severity.** What the read established:

- **`AUDIT_PRIMARY_DOC_ELECTION` is armed in production** — confirmed against the worker's live flag
  set. This matters: the forensic in `section-boundary-detector.ts:176-185` records that SAM assembly
  put a stub amendment at doc#1 on **3 of 3** measured packages, which returned an empty section map
  for the real solicitation. Flag-OFF that is a silent total-triage failure; it is mitigated today.
- **`commercialRoutingSafe` evaluates a lens map production does not use** — it reads
  `LENS_SECTIONS_COMMERCIAL`, live only under `AUDIT_LENS_EMISSION_INTEGRITY`, which is **not set on
  the worker**. `anyLensStarvedUnderLiveMap` reads the correct map and is not the predicate the router
  consults. Both returned the same answer on W911SG27BA002, so nothing is mis-decided there — but the
  predicate is measuring the wrong map. (Banked in #497; repeated here because it is a stage-04
  property, not a W911 property.)
- **Routing is not primary-scoped, while section detection is.** `detectSections` deliberately
  confines UCF boundaries to the primary document region (`:159-209`, the C-6/C-11 discipline);
  `routeCommercialSections` slices the entire assembled source across every document. On
  W911SG27BA002 that produced 13 §L anchor hits and a 239,088-char §L, because the Instructions to
  Bidders appear four times across the package (original, revised, inside the 157-page combined
  document, and in the amendment). Over-capture is fail-safe for coverage and the asymmetry is
  defensible, but it is a real cost multiplier on packages with repeated documents, and it is not
  written down anywhere.

---

## What this does not cover

- **No live run.** Everything here is static reading plus one $0 metadata query. P0-1 is verified
  against the API's own capability record; P0-2, P1-4 and P2-5 are verified by reading the code path.
  P1-3 rests on the documented support matrix and is explicitly not probed.
- **Frequency is unmeasured** for P1-4 (how often a lens reads and submits in one turn) and for the
  banked clipped-retry finding. Both are answerable from a banked run record once one exists that was
  produced after #493's per-call labels landed.
- `agentic-panel.ts`, and the non-control-flow body of `agentic-sections.ts` and
  `section-boundary-detector.ts`, were scanned rather than read line by line.

## The order the fixes want to land in

P0-2 first. It is the smallest diff, it is independent of everything else, and it is what makes every
other failure in this stage survivable rather than fatal. P0-1 second — and until one of them lands,
**`AUDIT_LENS_EFFORT` should not be armed to `xhigh` at all.**
