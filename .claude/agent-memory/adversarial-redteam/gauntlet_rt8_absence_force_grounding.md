---
name: gauntlet-rt8-absence-force-grounding
description: REPORT-TRUTH #7/#8 red-team (810c5fd8) — 4 of 6 claims REFUTED; both LIVE flags rewrite text in the DANGEROUS direction; requirement text IS re-parsed downstream
metadata:
  type: project
---

Adversarial review of `src/lib/audit-absence-reconcile.ts` (#7) + `src/lib/audit-force-grounding.ts` (#8),
commit 810c5fd8, both flags ARMED on the production worker. Grade: **D — do not leave armed as-is.**

**Why:** the two modules' safety arguments are each written against ONE failure axis and the probes only
exercise that axis. Every break below was reproduced by running the SHIPPED exports (`npx tsx`), not by reading.

## The two P0 classes

1. **`groundModalForce` condition (4) is blind to an obligation sentence that does not lexically name the
   subject.** `sentencesNaming` splits on `/(?<=[.!?])\s+|\n+/` — the `\n+` arm makes PDF-extracted line-broken
   text into one-line "sentences", so `"Offerors must attend."` on its own line is NOT a sentence naming
   "site visit" and is invisible. The gate then strips `Mandatory` and publishes *"no sentence about "site
   visit" imposes attendance or eligibility consequences"* — a false denial, over a source that says
   `must attend`. Same class: pronoun consequences ("fail to participate in **it**"), synonyms with a >2-word
   gap ("site **inspection and orientation** visit"). Condition (2) inspects only `excerpt`, so a finding whose
   OWN requirement says "shall attend or be rejected as nonresponsive" still fires — output self-contradicts
   inside one sentence.

2. **`assertsDocAbsent` refutes a claim about artifact B from document A's presence** whenever A's token is the
   nearest pre-predicate token. `"Appendix C to the PWS is not attached"`, `"The PWS quality assurance
   surveillance plan is not provided"`, `"Wage rates for the option year positions are not provided"`,
   `"The PWS, the QASP and the bonding certificate are not provided — …"`. `INTERVENING_SUBJECT` only blocks a
   second COPULA or `[.;:]` — a trailing prepositional phrase or a comma list carries the token to the front
   with no copula. `regions.find()` takes the FIRST matching region and `consequenceOf` keeps only the
   em-dash tail, so the other documents' absence warnings are DELETED and replaced by
   *"an earlier statement that it was missing was wrong"* — itself false.

## "Text only, cannot move a verdict" is TRUE for the verdict, FALSE as scoped

`res.findings` (pre-seam) is what `bankRunRecord` banks, so replay is clean. But `payload.v3.findings` carries
the REWRITTEN text and **at least two downstream consumers pattern-match it**:
- `_render.ts:3037 PAST_RE` on `vm.show_stoppers[].condition` (= `f.requirement`) → flips a **Disqualifying**
  badge to muted **Closed** when #8's proof quote injects `"was held"`. Gated on `AUDIT_REPORT_NHR_COHERENCE`.
- `_view-model.ts:3826 has_data_rights_finding` → #7 discards the head clause, so `limited rights` disappears
  and the flag flips true→false. Gated on `AUDIT_V3_SECTION_ROUTING`.
- CHECKED AND CLEARED: the KO email (`riskToClarificationAsk` would split the title at the `—` and print
  "1. CORRECTED"), but v3_routed risks carry `faraudit_action:""` and category `Disqualification`, so they are
  filtered out before the ask loop. `audit-decide.ts` reads `f.requirement` heavily but runs UPSTREAM of the seam.

## Two smaller refutations
- The shared-prefix safety argument covers `CORRECTED — ` only. `UNANALYZED_PREFIX` (`NOT ANALYZED — `) is NOT
  skipped: #8 fires on #7's output and emits `CORRECTED — NOT ANALYZED — "…"` — the exact double-header the
  re-entry guard exists to prevent.
- Strip grammar: `"The site visit is mandatory."` → `"The site visit is ."`; a second unrelated qualifier is
  removed globally (`the mandatory disclosure rule` at FAR 52.203-13 → `the disclosure rule`).

## Method note worth keeping
`DOC_ABSENCE` traded ONE enumeration (the connective) for THREE others: the copula anchor `(?:is|are|was|were)`,
the participle list, and the rigid `not`+participle adjacency. `has not been provided`, `is not separately
provided`, `does not appear`, `is missing from`, and the bare no-copula noun-phrase style all still walk through
— and the shipped test's 13-entry `CONNECTIVES` array uses `is` in every single entry, so the battery is
structurally unable to see the copula monoculture. See [[feedback_a_battery_certifies_author_imagination]].
