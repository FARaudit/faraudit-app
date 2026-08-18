# Batched extraction — it is ~80% written, disconnected, and cheaper than estimated

**2026-08-17. Measured $0 through the production chunker over the banked corpus. No model calls, no
paid run.** The plan proposed batched per-document extraction as a *replacement* to be built. It is
largely already in the tree.

---

## The finding

`src/lib/agentic-map.ts` is a complete per-document extraction stage — schema
(`DOC_EXTRACT_SCHEMA`), chunking with overlap (`chunkForMap`, 600,000-char limit / 6,000 overlap),
a content-hashed extract cache (`withDocExtractCache`), merge (`mergeExtracts`), deterministic clause
enumeration (`enumerateClauses`), and prompt-injection defence. It reads each document **in its own
small context**, which is exactly the property the 2,098,225-char routing failure needs.

**It has zero runtime callers.** Its runner was deleted on 2026-06-28 when the engine went "100%
agentic"; `agentic-orchestrator.ts` now imports it **type-only**, and every real import lives under
`scripts/`. `buildCompactMatrix` — the reduce half — has **zero callers anywhere**.

`ENGINE-STAGE-MAP.md` listed this as live on `claude-haiku-4-5`. **That row was wrong and is
corrected in this branch.**

## What it would cost, measured

Production `chunkForMap` over every **readable binding document** in the banked corpus. Output modelled
at 1,200 tokens per chunk (a schema-constrained `DocExtract` is small and bounded); prices are the
verified list rates — Haiku $1/$5, Sonnet $3/$15 per MTok — with the Batch API's 50% discount shown
separately.

| | documents | chunks | input tokens | Haiku batched | Sonnet batched |
|---|---:|---:|---:|---:|---:|
| median package | 9 | 9 | 38,319 | **$0.05** | $0.14 |
| flagship `W911SG27BA002` | **52** | 53 | 750,322 | **$0.53** | $1.60 |

**Today's whole run on that package is $11.96, and it analyses 40 findings across 52 documents.**
Full extraction coverage of every readable binding document costs **$0.53 batched on Haiku — 4.4% of
the current run.** Chunking is near-free at this limit: 52 documents produce 53 chunks.

This is **cheaper than the plan's estimate** (~$1.46 Haiku / ~$4.37 Sonnet), because that estimate
predates the verified price table and did not use the production chunker.

## Why this is not simply "switch it back on"

The stage was removed for a reason, and reviving it is not a revert. Three things must be decided
before any code:

### 1. Extraction output must become something that credits coverage
`documentsCovered` credits a document only via a **grounded finding whose excerpt appears in that
document's region** and not in the primary (`audit-orchestrator.ts:887`). A `DocExtract` already
records its source document and carries verbatim item text, so the bridge is short — emit each
extracted item as a typed finding whose excerpt is the verbatim span.

**And the existing honesty machinery then applies unchanged, which is the point:** the excerpt must
genuinely be in the region, cross-attachment duplicates are already rejected (`:891`), and dropped/
boilerplate findings already credit nothing (`:890`). Nothing needs loosening for this to work.

### 2. …which means extraction findings enter the verdict
That is the real risk and it is not small. Extracted items would need controllability typing
(`bidder_controls` / `bidder_cannot_move` / `already_satisfied`) and the `requiredAttribute` /
`curableInWindow` pair, or they fail closed into branch 5a. **A Haiku extraction pass emitting
verdict-bearing findings is a materially different trust posture from a Haiku pass filling a matrix
that a Sonnet lens then reads.** Options, in increasing order of safety:

- extraction findings credit **coverage only**, never the verdict (safest; fixes the denominator and
  nothing else);
- extraction findings are **advisory input to the lenses** — the original map→matrix design;
- extraction findings are **first-class**, adjudicated by a schema-constrained pass (the plan's
  proposal, and the largest change).

**This is a CEO/Brain ruling, not an engineering preference.**

### 3. Batching is not in the tree at all
There is **no Anthropic Batch API integration anywhere in the repo** — verified by grep. The 50%
discount above is a list rate, not something the code can currently obtain. Batching also changes the
latency shape (asynchronous submit/poll), which interacts with `AGENTIC_V3_PRIMARY_BUDGET_MS`.
Unbatched Haiku is still only **$1.07** on the flagship package, so **batching is an optimisation, not
a prerequisite** — build the pass first, batch it second.

## Recommended sequence

1. **Ruling on §2** — what extraction output is allowed to do. Everything else depends on it.
2. **Revive the pass behind its own flag**, default-OFF, coverage-credit only. Provable at $0 on the
   banked corpus for chunking/merge, and the first paid validation is a single package.
3. **Bridge to `documentsCovered`** using the existing excerpt-in-region check. No new coverage
   semantics, no loosened guard.
4. **Batch it** once the pass is proven, if the cost then justifies the integration.

## What is NOT claimed here

- **No paid run was fired**, so extraction *quality* is unmeasured. Everything above is job size and
  price. Recall on a UFGS spec was measured separately at **regex 15–17% / model 0%** — and that
  model figure is a lens that never opened the document, not this extraction pass. **It is not
  evidence for or against this pass.**
- The revival is **not** a revert of the 2026-06-28 deletion. The engine that replaced it stays; this
  adds a per-document reader beneath it, for the documents no lens opens.
