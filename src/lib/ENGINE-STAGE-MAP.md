# ENGINE STAGE MAP — what runs, on what model, at which stage

Lives next to the code it describes so it cannot drift silently, and is tracked in git so it
cannot be lost. Verified 2026-07-31 against `model-registry.ts`, `agentic-panel.ts`,
`agentic-panel-runner.ts`, `audit-decide.ts`, and the `audit-worker` Railway environment.

**Read the MAIN column as production.** The worker deploys `main`. An open PR is not live, and
a single "Model (live)" column is what let an unmerged branch read as shipped.

| # | Stage | Role / tier | Model on MAIN (live) | Model on branch (unmerged) |
|---|---|---|---|---|
| 1 | MAP — per-doc extraction | `extractor` | `claude-haiku-4-5` | — |
| — | `buildCompactMatrix` | deterministic | none · $0 | — |
| 2 | Lenses — overview / compliance / risk | `lens` | `claude-sonnet-4-6` | — |
| 2.5 | Cross-doc pass | `crossdoc` | `claude-opus-4-8` | `claude-opus-5` (#385) |
| L3 | Section finder | `finder` | `claude-sonnet-4-6` | — |
| 3 | Expert loop → `submit_findings` | `lens` | `claude-sonnet-4-6` | `strict: true` (#384) |
| 4 | Skeptic — base | `lens` | `claude-sonnet-4-6` | — |
| 4b | Skeptic — escalation | `judge` | `claude-opus-4-8` | `claude-opus-5` (#385) |
| 5 | J-1 judgment reasoning | `judge` | `claude-opus-4-8` | `claude-opus-5` (#385) |
| 5b | J-2 entailment verifier | `judge` | `claude-opus-4-8` | `claude-opus-5` (#385) |
| 6 | Panel — **5 seats** (ids 1,2,3,4,6) | tier mix | 3× `sonnet-4-6` · 1× `opus-4-8` · 1× `haiku-4-5` | opus seat → `opus-5` (#385) |
| 6b | Panel — Adversarial Verifier | `opus` | `claude-opus-4-8` | `claude-opus-5` (#385) |
| 6c | Panel — Chief Judge (id 5, `gatekeeper_synthesizer`) | `sonnet` | `claude-sonnet-4-6` | — |
| 7 | `deriveVerdict` | **none — pure TypeScript** | **no model · no tools** | — |

No `AUDIT_*_MODEL` override variables are set on `audit-worker`, so the deployed code is the
whole story — there is no env layer to check separately.

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

`ceo/CLAUDE.md` says "six independent expert lenses" / "six-lens panel" in three places. Rule 54
puts that phrasing in universal external-copy scope, so the doctrine text and the code disagree
in customer-facing language. Correcting it is a Rule 39 edit and needs the CEO's word.
