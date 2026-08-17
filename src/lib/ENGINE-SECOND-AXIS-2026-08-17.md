# The second axis — stop proving readability with a capped tool call

**2026-08-17. Measured $0 over the banked corpus through the production `docRegions`, `hasEngineText`
and `isBindingDoc`. No model calls, no paid run.** Answers question 2 left open by
`ENGINE-OWNERSHIP-MAP-2026-08-17.md`: *how is a >40,000-char document attested at all?*

---

## The answer: it already can be, and the engine already has what it needs

**A document's full text is in `fullSource`.** `docRegions` (`audit-orchestrator.ts:742`) returns each
binding document's complete region text, and **no 40,000-char cap applies there**. The cap lives on
`readDocument` — the *tool a lens calls* — and nowhere else.

So the engine can already prove, deterministically and for $0, that it held a document's full text.
It just isn't asked to. Instead `audit-expert.ts:151` records a document as read only when a capped
tool call comes back `!truncated`, and coverage keys on that. **A truncation flag from a tool surface
is being used as evidence about the document.** It is not evidence about the document; it is evidence
about the slice size.

That single conflation is what forces INCOMPLETE on 77% of packages with attachments.

## The split

| signal | what it proves | how | cost |
|---|---|---|---|
| **`readable`** | the engine held this document's full text | deterministic sweep over the `docRegions` region text | **$0, no model** |
| **`analyzed`** | a lens engaged with it | a grounded finding whose excerpt lands in that document, or an explicit attestation | model |

Coverage requires **both**. Neither is produced by a capped tool call, so truncation stops carrying
any coverage meaning at all — it goes back to being what it is, a statement about how much the lens
saw in one slice.

The `readable` predicate is not new. It is `DocAttestation`'s, from the construction manifest
(`audit-construction-manifest.ts:132–147`), generalized off the part36 path: `hasEngineText(text)`, OR
obligation verbs present — because *"obligation verbs are real English words that cannot occur in a
scanned stub or mojibake"*, so their presence proves the document was read even when the word-floor
heuristic trips on an annotation-heavy drawing set.

## Measured on 50 packages / 429 binding documents

| | |
|---|---:|
| genuinely UNREADABLE (no engine text, no obligation verbs) | **14** |
| readable, zero obligations → attest read-and-empty | 45 |
| readable, carries obligations → needs analysis | **370** |
| documents over the 40,000-char tool cap | **76** |

### The swap this makes

| | packages forced to INCOMPLETE |
|---|---:|
| **today** — truncation stands in for unreadability | **34 of 44** |
| **proposed** — genuine unreadability only | **6 of 50** |

And the 6 are the right ones. Every genuinely unreadable document sits on a single solicitation
(`FA813726R0033`) and they are real scans: `Wage Determination 5-8-26.pdf`, `Sign In 05-28-2026.pdf`,
`Solicitation - FA813726R0033-amendment.pdf`. Those *should* return INCOMPLETE — or be OCR'd.

**The 6 is an upper bound.** These records banked their `fullSource` before `AUDIT_WORKER_OCR` was
armed, and it is armed on the live worker today (measured this session: it recovered every one of five
apparently-textless documents on `W911SG27BA002`). The live number is ≤ 6.

**76 documents currently cannot be attested at any lens skill level.** Under this split, zero of them
are unattestable *for readability reasons*.

## What paging is actually for

Paging is an **analysis affordance**, not an attestation mechanism — `read_document(name, page)` for a
lens that is grounding a finding in a large document. It is not needed to certify coverage, which is
why it is cheap:

- Document length is sharply skewed: **p50 12,098 chars** — most documents already fit in one read.
  p90 104,637 · p99 833,614 · max 874,858.
- Only **29 of 141** distinct (package, document) pairs exceed the cap.
- At a 40,000-char page: **289 pages for 141 documents — 148 extra pages across 50 packages**, about
  **3 per package**. Worst single document: 22 pages.

A lens pages the one document it is working in. It never slurps 874,858 characters, and nothing pages
a document just to prove it exists.

## The other half of the axis — the homogeneous bulk

The ownership map left `capture_strategist` holding **199,060–209,532 tokens** on the flagship package,
and 18 of the 29 over-cap documents are its technical specifications. Paging does not fix that: it
divides the reads, not the volume.

That bulk is **25 near-identical UFGS construction specs**, and a lens read is the wrong tool for 25
sibling documents. It is the exact shape the plan's already-costed replacement targets —
deterministic per-document extraction plus schema-constrained adjudication, **batched: ~$1.46 Haiku /
~$4.37 Sonnet against today's $11.96.**

**So the second axis is two mechanisms, and they are not alternatives:**

1. **Readability goes deterministic** — removes the forced INCOMPLETE on 34 of 44 packages and makes
   all 76 over-cap documents attestable. Cheap, and it is the unblocking move.
2. **The homogeneous spec bulk goes to batched extraction** — removes the volume the ownership map
   cannot divide. Paging covers the heterogeneous remainder.

## Risk, stated plainly

This **removes a cap**, so its failure direction is toward false-COMPLETE — the cardinal sin, and the
same direction that gates `AUDIT_VETO_NARROW_UNIVERSAL` (DO-NOT-ARM). The safety argument is that the
cap being removed never measured what it was standing in for: a truncated *tool read* was never
evidence that a document was unread, and the deterministic sweep that replaces it reads **more** of
the document, not less. But that argument has to be proven, not asserted:

- The gate must include a **negative control** — a genuinely scanned, textless document that must
  stay uncovered — proven able to go red.
- `analyzed` must remain independently required. Readability alone must never cover a document; if it
  did, this change would convert 370 unanalyzed documents into silent coverage, which is the
  false-COMPLETE it is accused of.
- The existing cross-attachment uniqueness and shared-excerpt guards in `documentsCovered`
  (`audit-orchestrator.ts:797`) are what keep `analyzed` honest and are untouched by this.

## Status

Designed and measured. **Nothing is wired.** Sequencing, and the ruling on accepting a tighter
`analyzed` requirement in exchange for a looser `readable` one, sit with the CEO.
