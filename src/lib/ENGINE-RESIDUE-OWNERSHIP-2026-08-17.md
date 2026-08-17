# Nobody owns the residue — and the existing mandate cannot be armed to fix it

**2026-08-17. Measured $0 through the production tools (`listBindingDocuments`, `readDocument`) over
the 50 banked run-records. No model calls, no paid run.** Companion to
`ENGINE-DENOMINATOR-SCOPE-2026-08-17.md`, whose step 0b found the real constraint: on the flagship
package **48 of 52 documents carry obligations and each needs a grounded finding, while the engine
produces 40 findings in total.**

---

## What is actually wired today

Read from `audit-expert.ts:138–192`, against the live Railway flag set:

- **`AUDIT_ATTACHMENT_COVERAGE=false`** ⇒ `isCoverageLens` is never true ⇒ `bindingDocs = []` ⇒ the
  MANDATORY checklist — *"For EACH, either ground ≥1 VERBATIM obligation from it in submit_findings,
  OR list it in `attestations` as read-with-no-operative-obligation"* — **is emitted to nobody**, and
  the pre-inject seeding never runs.
- **`AUDIT_LENS_DISCOVERY=true`** ⇒ all five lenses receive the NAMES notice, whose operative sentence
  is *"Read the ones whose subject matter your lens owns; ignore the rest."*

**So the mandate exists, is well built, and is switched off; what is switched on is an offer.** No
lens is obliged to open any document. That is the residue, and it is a design choice rather than a
defect. The prior note in memory is confirmed on this point, and its correction stands: the flag adds
the **mandate**, not the tool — `read_document` is already in every lens's hands.

## The obvious move — arm it — does not work, at any read cap

The pre-inject seeds each binding document through `readDocument`, which caps at
`DOC_READ_CAP = 40,000` chars. A capped read returns `truncated: true`, and `audit-expert.ts:151`
adds to `docsRead` **only when `!truncated`**. A truncated document is therefore never
provably-read-whole, can never be attested, stays uncovered, and forces INCOMPLETE — **no matter how
well the lens performs.**

Measured over the 44 banked packages that carry binding attachments, sweeping the (env-tunable)
`AGENTIC_DOC_READ_CAP`:

| `DOC_READ_CAP` | packages forced to INCOMPLETE | truncated docs | pre-inject p50 | pre-inject **max** |
|---:|---:|---:|---:|---:|
| **40,000** (today) | **34 of 44** | 74 | 34,358 tok | 274,744 tok |
| 80,000 | 11 of 44 | 26 | 34,358 tok | 351,716 tok |
| 160,000 | 4 of 44 | 12 | 36,175 tok | 453,189 tok |
| 400,000 | 3 of 44 | 5 | 36,175 tok | 624,443 tok |
| 2,000,000 | **0 of 44** | 0 | 36,175 tok | **748,752 tok** |

**Read the two ends together.** The cap that eliminates the forced-INCOMPLETE is the one that
pre-injects **748,752 tokens — the entire package — into a single lens.** The cap that keeps the
pre-inject survivable is the one that forces INCOMPLETE on **77% of packages with attachments.**

There is no value in between that does both. This is not a tuning problem.

### And the largest packages exceed the context outright

Lenses run **`claude-sonnet-4-6`** (`model-registry.ts:21`). The lens call path in `audit-expert.ts`
sends **no beta header at all** — the only betas in the repo are
`structured-outputs-2025-11-13,pdfs-2024-09-25` (`anthropic-structured.ts:13`, `audit-judgment.ts:22`),
and **no `context-1m` anywhere**. So the standard 200k context applies. At today's cap, **2 packages
already pre-inject over 200k tokens** (max 274,744) — before the system prompt, the tool schemas, the
UCF sections, or a single turn of transcript.

**Why the earlier estimate said this was safe.** A prior sizing measured p50 30,593 / max 71,872 and
concluded "zero packages over 200k". Its p50 was right — mine is 34,358, the same answer. Its **max**
was wrong, and it said so at the time: that corpus topped out at 15 binding documents and explicitly
warned *"the 45-attachment run 3b5bba30 is NOT banked."* It is banked now. **The whole failure lives
in a tail the old corpus could not see** — the median package is unbothered at either cap.

## What the fix has to change

Not the cap, and not the flag. **The shape.**

The mandate is *"one designated lens reads every binding document."* That is what forces the whole
package into one context, and fanning it across all five lenses is what blew the 270s budget on live
runs `6cbabeae` and `e63a9b2d` — so the two known configurations are "one lens drowns" and "five
lenses drown."

The missing thing is **ownership**: a deterministic assignment of each binding document to the lens
whose subject matter it belongs to — the wage determination to pricing, the security requirements to
cyber, the spec sections to the technical lens — so that the 48 documents are *divided* rather than
either duplicated or abandoned. That is the same routing defect the plan already names as M2
(**one lens receives 2,098,225 characters**), reached from the other end. It is one problem, not two,
and it is the reason neither can be fixed alone.

**Concretely, an ownership design has to answer three things this measurement does not:**

1. **Who owns a document no lens claims?** The residue does not disappear under routing — it moves.
   Whatever answers this is the actual honest-fail boundary.
2. **How is a >40,000-char document attested at all?** Ownership does not shrink a 400k-char spec.
   Attestation needs a paged or obligation-scoped read, not one whole-document slice.
3. **What does the coverage proof count when a lens declines its assignment?** Today silence reads as
   coverage; that is the 1.7% denominator, from the other direction.

## What NOT to do

- **Do not arm `AUDIT_ATTACHMENT_COVERAGE`.** At today's cap it forces INCOMPLETE on 34 of 44
  packages, and at any cap that fixes that it exceeds the context on the largest ones.
- **Do not raise `AGENTIC_DOC_READ_CAP` on its own.** It trades a forced INCOMPLETE for a context
  overflow, and the trade gets worse at every step.
- **Do not fan the existing mandate across five lenses.** Already measured, twice, on live runs.

## Status

Diagnosis complete and measured. **The design decision — the ownership map, and the three questions
above — is a product call and is not made here.** M2 routing and this are the same work; sequencing
them together is the recommendation the scope document already carries.
