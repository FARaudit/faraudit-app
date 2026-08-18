# ENGINE STAGE MAP — what runs, on what model, at which stage

Lives next to the code it describes so it cannot drift silently, and is tracked in git so it
cannot be lost. Verified 2026-07-31 (re-verified after #384 + #385 merged to main) against `model-registry.ts`, `agentic-panel.ts`,
`agentic-panel-runner.ts`, `audit-decide.ts`, and the `audit-worker` Railway environment.

**Read the MAIN column as production.** The worker deploys `main`. An open PR is not live, and
a single "Model (live)" column is what let an unmerged branch read as shipped.

| # | Stage | Role / tier | Model on MAIN (live) | Model on branch (unmerged) |
|---|---|---|---|---|
| 0a | OCR residual confirm — VISION (`makeVisionConfirmer`) | `crossdoc` | `claude-opus-5` | — |
| 0b | OCR rate-table confirm — VISION (`makeTableVisionConfirmer`) | `crossdoc` | `claude-opus-5` | — |
| ~~1~~ | ~~MAP — per-doc extraction~~ · **DEAD CODE, DOES NOT RUN** — see below | `extractor` | **none** | — |
| ~~—~~ | ~~`buildCompactMatrix`~~ · **DEAD CODE, DOES NOT RUN** | deterministic | **none** | — |
| 2 | Lenses — overview / compliance / risk | `lens` | `claude-sonnet-4-6` | — |
| 2.5 | Cross-doc pass | `crossdoc` | `claude-opus-5` | — (#385 merged) |
| L3 | Section finder | `finder` | `claude-sonnet-4-6` | — |
| 3 | Expert loop → `submit_findings` | `lens` | `claude-sonnet-4-6` | `strict: true` behind `AUDIT_STRICT_FINDINGS_TOOL`, unset ⇒ OFF (#384 merged) |
| 4 | Skeptic — base | `lens` | `claude-sonnet-4-6` | — |
| 4b | Skeptic — escalation | `judge` | `claude-opus-5` | — (#385 merged) |
| 5 | J-1 judgment reasoning | `judge` | `claude-opus-5` | — (#385 merged) |
| 5b | J-2 entailment verifier | `judge` | `claude-opus-5` | — (#385 merged) |
| 6 | Panel — **5 seats** (ids 1,2,3,4,6) | tier mix | 3× `sonnet-4-6` · 1× `opus-5` · 1× `haiku-4-5` | — (#385 merged) |
| 6b | Panel — Adversarial Verifier | `opus` | `claude-opus-5` | — (#385 merged) |
| 6c | Panel — Chief Judge (id 5, `gatekeeper_synthesizer`) | `sonnet` | `claude-sonnet-4-6` | — |
| 7 | `deriveVerdict` | **none — pure TypeScript** | **no model · no tools** | — |

## ⛔ ROW 1 WAS WRONG — the MAP stage has not run since 2026-06-28 (corrected 2026-08-17)

This table listed **stage 1, per-doc extraction on `claude-haiku-4-5`, as live on MAIN.** It is not
live. It is not gated off by a flag either — **its runner was deleted**, and the deletion left a note
one file away:

> `agentic-orchestrator.ts:250` — *"[V1/shadow purged 2026-06-28 — A4] runAgenticMap() removed — engine
> is 100% agentic (executeAgenticPrimary → auditPackage). See git history."*

Verified by counting callers, not by reading the comment. Every entry point of `agentic-map.ts` —
`mapDocument` · `selectMapTargets` · `mergeExtracts` · `withDocExtractCache` · `chunkForMap` — has
**zero non-test callers outside its own file**. `agentic-orchestrator.ts` imports the module
**type-only**. `buildCompactMatrix` (`agentic-lenses.ts:257`) has **zero callers anywhere**. So the
whole map → matrix → reduce path is dead: the expert loop reads the source directly through tools.

**Why this mattered more than a stale row.** This file opens by saying it *"lives next to the code it
describes so it cannot drift silently"*, and by warning that a single mislabelled column *"is what let
an unmerged branch read as shipped."* It then did the inverse for six weeks — it let **deleted code
read as shipped**, and it named a paid Haiku stage in the live column that bills nothing because it
never executes. `ENGINE-WALK-2026-08-05.md:31` had already recorded the type-only import without the
table being reconciled to it.

**The cost measurements are unaffected** — they were taken empirically from run records, which is why
no MAP line ever appeared in them. That absence was the evidence, and it was read as "cheap" rather
than "absent."

No `AUDIT_*_MODEL` override variables are set on `audit-worker`, so the deployed code is the
whole story — there is no env layer to check separately. Re-confirmed in-container 2026-08-02 by resolving
`modelFor(role)` inside the deployed worker, and the boot banner now prints that same resolved map (#392).

**Stages 0a/0b were MISSING from this table until 2026-08-02.** Both are real, paid `claude-opus-5` calls on
the customer path, and both are **live**: `AUDIT_WORKER_OCR=true` and `AUDIT_OCR_TABLE_CONFIRM=true` on
`audit-worker`. They are CONDITIONAL — 0a fires only for residual (scanned / OCR-held) documents, 0b only for
documents a deterministic scan marks `isRateTable` — which is precisely why they were easy to omit: a package
of clean text PDFs never triggers them, so they are invisible in the common case and appear only on the
scanned-document runs where cost and correctness are already hardest. A stage map that omits a paid stage
under-states both spend and the model surface being reviewed.

**Two registries, not one.** `model-registry.ts` says it is "the ONE place a role binds to a concrete model
ID"; it is not. The panel tiers (rows 6/6b/6c) resolve through a SECOND `modelFor` in
`agentic-panel-runner.ts` with its own defaults and its own env knobs (`AUDIT_JUDGE_MODEL`,
`AUDIT_PANEL_SONNET`, `AUDIT_PANEL_HAIKU`). A model swap made "in the registry, per the contract" silently
misses every panel seat — including the Adversarial Verifier, the single truth choke-point. See
`ENGINE-MODEL-FIT-REVIEW.md` D1.

## Model surface at a glance

| model | stages |
|---|---|
| `claude-opus-5` | 0a · 0b · 2.5 · 4b · 5 · 5b · one panel seat (Ex-KO, id 3) · 6b Adversarial Verifier |
| `claude-sonnet-4-6` | 2 · L3 · **3 (expert loop)** · 4 · three panel seats (ids 1, 2, 4) · 6c Chief Judge |
| `claude-haiku-4-5` | **1 (per-doc extraction)** · one panel seat (Small-Business counsel, id 6) |
| none — deterministic | `buildCompactMatrix` · 7 `deriveVerdict` |

The two **highest-volume** stages — per-doc extraction (runs once per document) and the expert loop (N lenses
× up to 8 turns) — are the two NOT on Opus 5. "The engine is on Opus 5" is not an accurate summary of this
table; Opus 5 owns the reasoning and adversarial-verification stages, not the reading stages.

## Stage 7 — the exit census

`deriveVerdict` spans `audit-decide.ts:3365–3924`. Every exit is built by the `mk()` constructor,
so the count is exact rather than estimated:

| Verdict | Exits | |
|---|---|---|
| `NEEDS_HUMAN_REVIEW` | 17 | decline |
| `INCOMPLETE` | 7 | decline |
| `BID_WITH_CAUTION` | 5 | **commit** |
| `NO_BID` | 2 | decline |
| `BID` | 2 | **commit** |
| `INELIGIBLE` | 1 | decline |
| **total** | **34** | **27 decline : 7 commit** |

`INELIGIBLE` is easy to drop from this census; it is a real exit and it declines.

## Panel shape — five, not six

The panel is **5 lenses + 1 adversarial verifier + 1 chief judge**. Seat ids run 1, 2, 3, 4, 6;
id 5 (`gatekeeper_synthesizer`) was promoted out of the lens bank to CHIEF_JUDGE.

`ceo/CLAUDE.md` used to say "six independent expert lenses" / "six-lens panel" in three places.
CEO ruled 2026-07-31 (Rule 39 satisfied): **drop the number** rather than change six to five, so a
seat change never needs a doctrine edit again. Now reads "independent expert lenses". Rationale and
the superseded text: `ceo/DOCTRINE-CHANGELOG.md` CL-54-LENSCOUNT.

`ARCHITECTURE.md` was not audited for the same phrasing and may still carry a count.
