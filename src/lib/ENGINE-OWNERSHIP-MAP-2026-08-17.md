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
