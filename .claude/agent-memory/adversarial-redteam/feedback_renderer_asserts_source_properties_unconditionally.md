---
name: renderer-asserts-source-properties-unconditionally
description: Hunt hardcoded renderer strings that ASSERT a property of the source (order, importance, cause, completeness) with no conditional on whether the source said it — a fabrication class that grounding checks cannot see
metadata:
  type: feedback
---

A renderer heading is a CLAIM ABOUT THE SOURCE. Grep the render layer for hardcoded prose that asserts a
source property, then check the conditional guarding it. If there is no conditional, the claim is false on
every document that lacks the property.

**Why:** on audit `eab43ada` (W50S6U26QA019) `src/lib/v5-report/render.ts:618` prints
`Evaluation factors — in the Government's stated order of importance` and `:606` stamps
`<span class="mx-most">Most important</span>` on `i === 0`, both UNCONDITIONALLY. Section M of that
solicitation states exactly two factors and says *"Price and past performance are approximately equal in
importance"*, and §M ¶1.4 says the responsibility determination is *"not a separate comparative evaluation
factor."* The report published a ranked ladder of SEVEN and badged the responsibility determination
"Most important." Measured slot by slot, that ladder contains **neither of the source's two actual factors
as a named factor** — slots 1–4 are risk commentary, slots 5–7 are `Procedural obligation (§M): …` blobs,
and three of the seven are ALSO counted in the "Gates to clear" list (double-rendered across two surfaces).
Three lines below, the same panel prints *"No weights, no total, no score — the Government did not publish
one, and neither do we."* Every finding under it was correctly grounded; the fabrication is entirely frame.

Same class, same run: `audit-decide.ts:3572` hardcodes the cause
`"could not be confirmed read in full (unfetched, scanned/no-text, or truncated)"` and then appends a gap
list built from documents whose own persisted reason is `"read in full, but no finding was grounded in it"`.
The engine had the true cause in the same object and overwrote it with a template.

**How to apply:**
- Rule 64 / verbatim grounding CANNOT catch this. Every excerpt was real; the lie is in the label, the
  ordinal, and the section heading — none of which is an excerpt. Audit the *frame*, not just the quotes.
- Probe: `grep -rn "order of importance\|Most important\|most important\|complete\|not located\|could not be"
  src/lib/v*-report/ src/lib/audit-decide.ts` then read the conditional. `i === 0`, `${n} of ${m}`, and a
  bare template literal are the shapes to distrust.
- A page that asserts a ranking and then disclaims ranking IS the tell. Read adjacent prose blocks together;
  self-contradiction inside one card is cheap to find and always means one side is unguarded.
- Report it as `contradicts-source`, not as a display nit. A bidder shapes the whole quote off the §M frame.

Related: [[feedback-grounding-checks-excerpt-not-claim]], [[panel-eab43ada-w50s6u26qa019-adjudication]],
[[feedback-render-cause-must-derive-from-engine]]
