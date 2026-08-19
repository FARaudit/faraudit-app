# The ownership map — designed, built, measured, and NOT sufficient on its own

> ## ⚑ DOCTRINE RECORDED 2026-08-19 (Brain ruling, CEO-approved 08-17)
> **1 Ownership is TOTAL** — every obligation-carrying document gets exactly one owner before any lens
> fires; unassignable ⇒ a NAMED coverage gap, never silence. **2 OWNERSHIP IS DOCUMENT-KEYED, NOT SECTION-KEYED** — sections are a hint; the document is the unit. **3 Routing is 1:1** — no fan-out.
> **4 Refusal must NAME what it could not read** — the refusal itself is untouchable. **5 COVERAGE IS DERIVED, never recorded** — a proof grading its own subset is a placebo (Rule 69).
>
> **MEASURED on the flagship the same day: 52 binding documents, 48 carrying obligations, and 51 have
> NO POSSIBLE OWNER under the live section-keyed lanes — 47 of those carry obligations.** That is why
> "ignore the rest" is an offer: the rest is structurally unownable. Full table + router proposal →
> `ceo/engine/ownership-remainder-map.md`.

> ## ⚑ SIX RULINGS — Brain, CEO-approved 2026-08-17 · recorded 2026-08-19
> **CANONICAL TEXT. This file is version-controlled and exists in every worktree and in CI; `ceo/` does
> not (`.gitignore:45`). `ceo/engine/ownership-remainder-map.md` carries the per-document measurement
> and points here for the rulings — one home, so the two cannot drift into two rules.**
>
> Each ruling is recorded as given. Where the $0 re-measurement of 2026-08-19 **diverges from the number
> in the ruling, the divergence is recorded beside it and the measured value governs** — a ruling is an
> instruction, and a number inside it is still a claim.

### R1 — TWO AXES, NOT ONE. Ownership was necessary and INSUFFICIENT.
Ownership fixes **who reads what**; it does not fix **volume within a lane**. Both axes ship together:
document-keyed ownership for the heterogeneous remainder, batched per-document extraction
(`AUDIT_DOC_EXTRACTION`, merged and dormant) for the homogeneous spec bulk — 54 of 135 observed names.
**A four-week target assuming the router alone closes the 47 will miss.**

**MEASURED 08-17 (read volume through `readDocument`, which caps each document at `DOC_READ_CAP`
40,000 chars):** busiest lens p50 34,358 → 13,134 tok (−62%), max 274,744 → 209,532 (−24%), 1 of 44
packages over context. **The ruling quotes these and they reproduce.**

⚠ **DIVERGENCE — re-measured 08-19 over the UNCAPPED region text (`docRegions`), residue folded into
`former_ko` by rule, 50 banked packages: p50 30,713 tok · p90 153,139 · MAX 655,864 · 4 of 50 over
200,000.** Both numbers are correct and they answer different questions. The 08-17 figure is what a
lens can RECEIVE through a 40k-per-document read cap; the 08-19 figure is what the owned set actually
CONTAINS. **The gap between them is unread content — the cap does not shrink the obligation set, it
hides it.** R1's conclusion strengthens: on the uncapped measure the busiest lane holds 655k tokens
against an 8-turn budget, so the second axis is not optional at any p50.

### R2 — THE OVER-CONTEXT PACKAGE IS AN HONEST-FAIL CASE, NOT A TARGET.
The engine names the package as exceeding single-pass capacity and refuses. **Do not engineer around
it.** Same surface as `ENGINE-SIZE-REFUSAL-SURFACE` already in the backlog — **ONE implementation, not
two.** Naming a real limit is the product claim working.

⚠ **DIVERGENCE — the population is larger than "1 in 44".** On the uncapped measure it is **4 of 50**.
The refusal surface must be built for a class, not for one specimen.

### R3 — COVERAGE HAS MORE THAN ONE DEFINITION. RULE 68 VIOLATION. Collapse to ONE.
Recorded as ruled: the completeness proof grades **48 of 2,879** enumerable obligations (**1.7%**) while
the derived document measure is a different fraction, and both are called coverage. **Rule 69 — a proof
that grades its own subset is a placebo control.**

⚠ **DIVERGENCE, and it is bigger than the ruling states — there are THREE layers, not two, and the
document layer alone has two disagreeing implementations inside a single run record.** Already measured
and written up in `ENGINE-DENOMINATOR-SCOPE-2026-08-17.md`: layer **A · sections** (`required = ["L"]`,
1 of 53), layer **B · documents**, layer **C · obligations** (48 of 2,879). Re-measured on the flagship
run record `3b5bba30`, $0, production functions only:

| measure | value | how |
|---|---:|---|
| posted binding documents received | **52** | `docRegions` = 53 regions, minus the notice body (UNIVERSAL) |
| …carrying an obligation | **48** | production `countGroundableObligations` over full region text |
| …assignable under the DOCUMENT-keyed map | **50** | `ownerOf`; true residue **2** |
| …the engine's OWN coverage says analysed | **8 of 52** (15.4%) | `deriveAnalyzedDocuments(uncoveredForGap)` |
| …**ANALYSED under the definition chosen below** | **3 of 52** (5.8%) | `deriveDocumentCoverage` |
| …obligation-carrying AND analysed — **the R6 measure** | **3 of 48** (6.3%) | `deriveDocumentCoverage` |
| …credited by an excerpt SHARED with another document | **6** | `sharedExcerptCreditOnly` |

**The "9 of 52 / 17.3%" figure carried in the continuity pointer does not reproduce.** The engine's own
coverage path says **8 of 52 (15.4%)**; under the definition chosen below it is **3 of 52 (5.8%)**.
**Do not quote 9 or 17.3% again.**

> ##### ⚠ A CORRECTION TO A CORRECTION, kept visible because it is the whole lesson
> An earlier pass of this same measurement counted **53 received / 49 obligation-carrying** and recorded
> that the ruling's denominator "is 49, not 48". **That was wrong, and the error was mine:** it counted
> the SAM Notice Body as a posted document. The notice body is SAM's description field, is UNIVERSAL —
> every lens already reads it — and is excluded from both sides of the coverage ratio by the same rule
> `deriveAnalyzedDocuments` already applies. Excluded, the totals are **52 and 48**, exactly as R6 states.
> **R6's "48 of 48" is correct and stands. The ownership remainder is 47 and stands.**
> What survives from that pass is a REAL and separate defect, and it is a membership error rather than a
> total: the per-document table in `ceo/engine/ownership-remainder-map.md` enumerates 52 rows that are
> **51 posted documents plus the notice body** — it omits `W911SG27BA002 Instructions to Bidders
> (Revised).pdf` while counting a row that does not belong in the denominator. The two errors cancel in
> the totals and do not cancel in the membership, and the omitted document is one the engine actually
> read. **A total that reconciles is not a set that reconciles.**

> #### ⛔ THE DEFECT THIS SURFACED — three documents are counted COVERED that nothing analysed
> `Bid Schedule_…_PavingNM.pdf`, `Solicitation Amendment …0001 SF 30.pdf` and `Solicitation Amendment -
> …0001.pdf` are all outside the gap list, and **no finding is attributed to any of them.** Mechanism,
> confirmed by re-running the join: `documentsCovered` tests each region **independently**, so an
> excerpt that is verbatim in two documents credits **both** — the two Bid Schedules share the phrase
> that carries `pricing_analyst#0/#1`, and five regions share the phrase carrying `capture_strategist#0`.
> The guard for exactly this exists — the cross-attachment uniqueness gate at `audit-orchestrator.ts:857`
> — and it is **inert in production**: `crossAttGate` requires `opts.docsRead`/`opts.attestations`, which
> only arrive under `AUDIT_ATTACHMENT_COVERAGE`, and that flag reads **false on the live worker**.
> **37.5% of the flagship's "covered" set is shared-excerpt credit.** A shared excerpt proves the phrase
> was read; it does not prove the document was analysed, and for near-duplicate siblings everything that
> DIFFERS between them is exactly what went unread.

**THE ONE DEFINITION, CHOSEN:** **coverage is DOCUMENT-KEYED (layer B), and a document is ANALYSED only
when a grounded, decision-bearing finding's analyzed excerpt is verbatim in THAT document and in no
other.** Chosen because it is the measure R6's four-week target is stated in, the measure doctrine rule
5 derives, and the only one of the three a customer can verify by opening the report. Layer C's 2,879
remains a **diagnostic** and is never called coverage. Layer A stays as-is pending the step-2 ruling.
**Defined in ONE place: `src/lib/audit-coverage-definition.ts`.** Every other coverage figure derives
from it.

### R4 — VERDICT ABSENCE HAS TWO CAUSES. Record them separately, never again as one.
Card 858 reported "zero BID · zero NO_BID · zero INELIGIBLE" as a single finding. It is two:
**NO_BID and INELIGIBLE are UNARMED PATHWAYS — not coverage artefacts. Zero plain BID IS coverage.**

✅ **CONFIRMED, and more precisely than the ruling states** — established 2026-08-05 by the line-by-line
`deriveVerdict` audit executed at production flag parity on worker sha `12e43884`
(`ENGINE-DECIDE-AUDIT-2026-08-05.md`). The three decisive decline exits are dark for three DIFFERENT
reasons, none of them coverage: `NO_BID` at `audit-decide.ts:3438` needs `AUDIT_TEMPORAL_VERDICT`
(unset) · `NO_BID` at `:3750` is suppressed at `:3716` unless `AUDIT_FOURWALLS_NOBID=true` (unset) ·
`INELIGIBLE` at `:3756` needs `closedWorld: true`, **which no production code builds**. So the framing
"the engine has never said no" is not a coverage finding at all — it is three unarmed levers, two of
them one environment variable each.

### R5 — COST IS SETTLED. STOP WEIGHING IT.
+$2/audit at 1:1 routing, against a run already spending **$5.67 on a panel that landed nothing**.
**Not a constraint.** Cost is not to be re-litigated in any downstream document or card.

### R6 — THE FOUR-WEEK TARGET, MEASURABLE.
**ONE package where every obligation-carrying document is owned, analysed, and produces a grounded
finding** — on flagship `W911SG27BA002` that is **48 of 48** — **and a report the CEO would hand a
stranger without apologising.** NOT CERT-5 completion. NOT a shifted verdict distribution. **Coverage of
one package, taken to defensible.**

✅ **CONFIRMED — the denominator IS 48**, by the production obligation detector over the full text of the
52 posted binding documents (notice body excluded as UNIVERSAL). **Today's figure under the chosen
definition is 3.** The target stands exactly as ruled: **48 of 48.**


---

**2026-08-17. Built from the 135 binding-document names actually observed across the banked corpus,
measured $0 through the production tools. No model calls, no paid run.** Answers the design question
left open by `ENGINE-RESIDUE-OWNERSHIP-2026-08-17.md`.

The map is a proposal. **Nothing is wired** — `scripts/audit-ai/_ownership-map-proposal.ts` has no
caller, deliberately, until the open questions below are ruled on.

---

## The headline, first

Ownership **rebalances** the load and does **not** solve it.

| | one lens gets all (today's pre-inject) | after ownership |
|---|---:|---:|
| busiest single lens, p50 | 34,358 tok | **13,134 tok** |
| busiest single lens, max | 274,744 tok | **209,532 tok** |
| packages where the busiest lens exceeds 200k | 2 of 44 | **1 of 44** |

p50 falls 62%. **The max falls 24% and still breaks the context.** So the map is necessary and it is
not the fix — the second axis below is not optional.

## Why: the concentration is real, not an artifact of assignment

Of 135 distinct observed names, **54 are technical specifications** — 25 of them `UFGS` construction
specs on a single package (`Attachment N - UFGS 32 12 16 Hot-Mix Asphalt HMA for Roads.pdf` and
siblings). They genuinely belong to one lane. No assignment of documents-to-lenses divides a pile
that is intrinsically one lens's work.

Distribution over the observed names:

| owner | names | lane |
|---|---:|---|
| `capture_strategist` | 54 | §C scope, specs, inspection/acceptance, drawings |
| `pricing_analyst` | 25 | wage determinations, bid schedules, labor categories |
| `former_ko` | 21 | amendments/SF-30, Q&A and RFI answers, mandatory forms |
| `contracts_attorney` | 9 | provisions and clauses, security requirements, flow-downs |
| `proposal_manager` | 6 | instructions to bidders, PPQ, submittal register |
| **RESIDUE** | **20 (15%)** | nothing matched |

## What measuring it changed about the design

### 1. Separator normalization is the single biggest classifier defect
v0 scored **22% residue**. Real SAM filenames carry `_` and URL-encoded `+`/`%28` where a human would
type a space, and **both defeat `\b` and `\s+`**:

- `ATT12_Submittal Register.pdf` never matched `/\bsubmittal\s+register\b/` — `_` is a word character,
  so there is no boundary before `Submittal`.
- `Attachment 1 — Statement+of+Work+-+Dorm+Cameras+%28Updated+v2%29.pdf` never matched
  `/\bstatement\s+of\s+work\b/`.

Decoding and flattening separators first — the same trick `classifySectionRoles` already uses
(`sam-attachments.ts:339`) — took residue **22% → 15%** with no new rules. Two more real-corpus traps
survive and are worth knowing about: one filename misspells it **`Davis-Beacon`**, and
`ATT10_STATEMENT OF WORKr1.pdf` glues a version suffix onto the word so `\bwork\b` cannot fire.

### 2. There are THREE outcomes, not two
The residue list is not homogeneous. Six of the twenty are **the solicitation itself** — `SAM Notice
Body`, `Solicitation - W911SG27BA002.pdf`, `RFP SPRRA2-26-R-0034.pdf`, `COMBINED SOLICITATION RFQ …`.
Those are not unclaimed; they are **universal**, every lens already reads them through `read_section`,
and routing them to one owner would be actively wrong.

So the map must emit:

- **OWNED** — exactly one lens.
- **UNIVERSAL** — the primary solicitation / notice body. Never enters the ownership map.
- **RESIDUE** — genuinely opaque: `A0001.pdf`, `am_2.pdf`, `36C24126Q0569 0002.docx`,
  `697DCK-26-R-00186 0002.pdf`. Roughly **10% once the universal class is removed.**

## Answering the three questions the prior document left open

**1. Who owns a document no lens claims?** → **`former_ko`**, by rule and not by name. Its lane is
already *"the whole package for show-stoppers and traps an evaluator would enforce"*
(`audit-lenses.ts:60`), which is exactly the disposition an unidentifiable binding document needs.
Measured cost of that assignment on the worst package: residue 13,959 tok on top of former_ko's own
21,224 → **~35k**, comfortably inside budget. **The residue does not disappear under routing, it
becomes one lens's named responsibility** — which is the point, because today it is nobody's.

**2. How is a >40,000-char document attested?** → **Still open, and ownership does not touch it.**
This is the second axis, and the map cannot ship without it. See below.

**3. What does the coverage proof count when a lens declines its assignment?** → **A product call,
not made here.** Note it is now a *smaller* question: with ownership, "declined" is attributable to a
named lens rather than diffused across five, so the honest-fail can say which lane went unread.

## The second axis — required, not optional

`capture_strategist` still receives **199,060–209,532 tokens** on the flagship package. Two candidate
mechanisms, and they are complementary rather than alternatives:

- **Shard within an owner.** Fan the owned set across N parallel calls of the *same* lens. Divides
  wall-clock and context; multiplies call count and cost.
- **Send the homogeneous bulk to batched extraction instead of a lens.** The 25 UFGS specs are a
  near-identical document class, and the plan's already-costed replacement — deterministic per-document
  extraction plus schema-constrained adjudication, batched — is aimed exactly at this shape
  (**~$1.46 Haiku / ~$4.37 Sonnet batched against today's $11.96**). A lens read is the wrong tool for
  25 sibling construction specs.

**Recommended split: the ownership map routes the heterogeneous documents to lenses; the homogeneous
spec bulk goes to batched extraction.** That is the only combination measured here that gets the
busiest lens under budget on every package.

## What this map deliberately does NOT do

- **It does not classify by content.** Names only — deterministic, $0, no model call, inspectable.
  A name-based map is wrong sometimes; the failure mode is a document routed to the wrong lane, which
  is strictly better than today's "routed nowhere".
- **It does not duplicate.** One document, one owner. Fanning the mandate across five lenses is
  already measured as the thing that blew the 270s budget on live runs `6cbabeae` / `e63a9b2d`.
- **It does not use blocklists.** Every rule is a positive shape; anything unmatched falls to RESIDUE
  and is *named*, never silently dropped.
- **It is not wired.** No caller, by design, pending questions 2 and 3.

## Before this ships, it needs a gate that can go red

The map is a pure function of a filename, so it is cheaply testable, and it must be: a rule that
stops matching is invisible at runtime — the document simply becomes residue and the coverage number
drifts down without any error. **The gate is a fixture of the observed names with their expected
owners, plus a negative control** (a name that must stay RESIDUE), proven able to fail by breaking
one rule and confirming exit 1.
