---
name: gauntlet-rt7-round4-post-vector-fixes
description: RT7 ROUND 4 (main @ 2e31b559) — the DOC_IDENTIFIER fix closed all four round-3 vectors but INVERTED the monotonicity: adding a WRONG attachment number turns a stand-down into a refutation. Plus an unhardened set-aside arm and stub-region presence proof. Grade D, do not arm.
metadata:
  type: project
---

# RT7 ROUND 4 — `audit-absence-reconcile.ts` after the three 08-04 fixes (main @ 2e31b559)

Flag state VERIFIED LIVE on both authorities, not taken from the brief or from `live-flags.snapshot.json`
(which this bank already records as STALE): Railway `audit-worker` env returns `AUDIT_ABSENCE_RECONCILE=false`
(146 keys, exact-key hit 1, control key `AUDIT_NONPRESENCE_HONESTY` present) and `vercel env ls production`
lists it `false · Production · 5d ago`. Suite 48/48 and generalization 0.6% executed here; **`npx tsc --noEmit`
re-run independently → exit 0, 0 error lines** (it had been quoted from the commit message, which is not
evidence). Note: a first flag check reported "key absent" — that was my own `2>&1` folding the CLI banner into
the grep, not a real absence. Disambiguate CLI-unavailable from key-absent before reporting either.
**Grade D — DO NOT ARM (unchanged from round 3).** Four vectors closed, three new classes opened, all in the
deletes-a-warning direction, two of them on **unmutated production region names**.

## CREDIT — the four round-3 vectors are genuinely dead
All 8 r2/r3 break strings stand down under `DOC_IDENTIFIER` + `/[\p{L}\p{N}]/u`, executed on each break's own
run's real regions. The `\p{N}` residue change costs zero corrections on the corpus and its false negatives are
all safe-direction. `fitToRender` now on both arms; the set-aside correction base survives whole (verified: the
cut always lands in the appended analysis).

## P0-1 — MONOTONICITY INVERTED. A **wrong** identifier is what makes the claim refutable.

**ATTRIBUTION CORRECTED BY SELF-REFUTATION — run the PRE-FIX module before saying "the fix admits X".** I
extracted `git show 9a9b2bf3:src/lib/audit-absence-reconcile.ts` (rewriting only its relative import) and drove
both versions over the same real bytes. Result: **all 8 round-4 breaks are `LEFT OPEN`, none is `ADMITTED`** —
they fired pre-fix too — while both vague twins are genuinely `CLOSED by the fix`. So 2e31b559 is a strict
narrowing exactly as it claims, and must not be blamed for creating these. The defect and the monotonicity pair
are unchanged (both measured on the SHIPPED rule); only the attribution is corrected. Sharp form: **the fix
closed the VAGUE half of vector 1 and left the SPECIFIC half — the more dangerous half**, because a claim
carrying an explicit (wrong) attachment number is the one a reader trusts most.
`git log -L '/const SET_ASIDE_SUBJECT/,+1'` returns only the module's ORIGINAL commit — P0-2's "zero hardening"
is grounded in git history, not asserted.
`DOC_IDENTIFIER` is tested for SHAPE against the subject span and its NUMBER is never compared to the region.
So the condition added to prove "which document" is satisfied by a claim naming a *different* document, and the
round-3 vector-1 breaks come straight back the moment the claim gets **more** specific. Executed pairs, real bytes:

| run | claim | result |
|---|---|---|
| 496a9a21 | `The Submittal Register is not provided.` | stands down |
| 496a9a21 | `The Submittal Register (Attachment 7) is not provided.` | **REFUTED against ATT12_Submittal Register.pdf** |
| 496a9a21 | `The Design Narrative (Attachment 4) …` | **REFUTED against ATT11_260007_Design Narrative.pdf** |
| eab43ada | `The Vendor Vetting Form (Attachment 0005) is not attached.` | **REFUTED against Attachment_0003_Vendor_Vetting_Form.xlsx** (and that run HAS a real Attachment 0005 — a different document) |
| eab43ada | `The site plan (Attachment 0004) …` | **REFUTED against Attachment_0001_Drawing_C1.01_…pdf** |
| 8c6fbf67 | `Environmental Control Unit (Attachment 3) …` | **REFUTED against RFP_24K … Parts List.xlsx** (region carries no number at all) |

Plausibility is GROUNDED IN THE RUN'S OWN SOURCE, not asserted — eab43ada's amendment text contains
`The attachments table has changed from:` (twice) and `Amendment 0002: … replace PWS Attachment 1 Drawing C1.01
Site Mowing/Mulching Plan in its entirety with Version 2`. The attachment table churns across amendments, so a
lens quoting a superseded table carries a stale number into exactly this shape.

## P0-2 — the SET-ASIDE arm has had ZERO hardening. `SET_ASIDE_SUBJECT` = "contains set-aside within 40 chars".
The doc arm survived four rewrites of "proximity is not subject position"; the fact arm still has the v1 defect.
Executed on 61aaaa95 (`set_aside="SBA"`), each **refuted** and replaced with *"set-aside resolved to SBA … Confirm
your firm qualifies under it"*:
`The set-aside NAICS code is not specified` · `The set-aside size standard is not stated` · `The set-aside
percentage of work limitation is not identified` · `The set-aside recertification date is not stated`.
4 of 8 wrong. Each deletes a distinct, possibly-true warning and replaces it with a non-sequitur.

## P0-3 — presence is proved by BYTE COUNT with no floor; failed extractions count as "provided".
`NOT ANALYZED — "<name>" IS in the retrieved source (N characters) … It is not missing; it is unanalyzed.`
Executed, unmutated: `The storm site (Attachment 4) is not provided` → refuted against
`WH SITE WEBGIS 14-1020x storm-STORM SITE Q3.pdf`, whose **entire region text is `-- 1 of 1 --` (20 chars)**.
Also `The site visit (Attachment 7) …` → refuted against a **297-char mojibake** region
(`*%x \`@D[dsxM[TwYx…`). Corpus holds regions of 20 / 221 / 297 / 407 / 430 / 866 chars. Honest-fail inversion
(Rule 61): a failed dependency published as presence.

## P1 — the set-aside arm deletes OTHER true absence warnings from the preserved analysis
`filter(sent => !FACT_ABSENCE.test(sent))` drops **every** unstated-fact sentence, not the set-aside one.
Executed: `"Set-aside type is not stated in Section B. The inspection and acceptance point is not specified
anywhere in the package, so offerors cannot price transportation. Offerors must submit a size certification…"`
→ published keeps only the last sentence. The transportation-pricing warning is silently deleted.

## P1 — `_rt7-v1-groundtruth.ts` reads a key that does not exist on ANY audit
It reads `compliance_json.v3.finding_provenance || []`. Measured across 16 audits: **`v3.finding_provenance` is
absent on all 16**; the real key is top-level `compliance_json.finding_provenance` (9–105 entries each), which is
what `_rt7-generalization.ts` reads and what the executor computes live. The `|| []` cannot fail, so the
instrument forces every row onto the `present_not_analyzed` branch — 2 of its 5 rows print the wrong `kind` and
therefore the wrong published text. Refuted claim SET is unaffected (provenance only picks the branch), so the
"all 4 TPs carry an identifier" observation survives.
**RETRACTED on execution:** my lead hypothesis — "the module tells the customer nothing reflects a PWS that
produced 3 findings" — is FALSE in production. With live provenance both PWS rows take the `CORRECTED —` branch.

## Value is confined to one solicitation family — quantified
16 audits · 1032 findings · **5 corrections, all from W9123826QA032** (3 runs of one solicitation, 2 distinct
claim texts). Counted under LIVE provenance: **16 scanned · 13 zero · 3 with corrections, and those 3 are the
same solicitation.** (An earlier draft said "13 of 14" — that mixed the 16-audit groundtruth corpus with the
14-audit generalization corpus; corrected on re-execution.) `CONSIDERED` corpus-wide = **6**, of which 4 are TPs.
So "closes vectors 1 and 4 with zero marginal corpus cost" is true and **vacuous** — the corpus contains nothing
for the condition to cost. The suite pins a KNOWN FALSE NEGATIVE (a plain, true, unidentified claim is declined),
so on any solicitation whose lenses do not write `(Attachment NNNN)` the module is inert.

## A FIX PATH EXISTS AND WAS RUN (4/4 TPs kept · 0/15 breaks leaked)
Evaluated by recomputing the shipped span exactly, then applying the candidate — against the 4 banked TPs, the 8
round-3 breaks and the 7 round-4 breaks, each on its own run's real regions.
- **A — identifier NUMBERS must not contradict.** If both the span and the region name carry an identifier
  number, they must agree; if either side has none, allow (this is what keeps the TPs: `PWS KO Appropved` and
  `WAGE DETERMINATIONS` carry no attachment number). Alone: 3 breaks still leak. **Gotcha: `\b` after the digits
  fails before `_`, so `Attachment_0001_Drawing` yields NO number** — my first run of this candidate scored a
  false 7/15 for that reason. End the pattern with `(?!\d)` and start it with `(?:^|[^a-z])`.
- **B — region content floor (2000 chars).** Kills the stub/mojibake and the no-region-number ECU case. Both TPs
  are 28,728 / 29,427 chars. Declines the 866-char Q&A — safe direction.
- **A+B: TPs LOST 0/4 · BREAKS LEAKED 0/15.**
- **C — set-aside subject = affirmative residue** (strip `set[\s-]?aside` + determiners; residue must be empty or
  one of `type|status|designation|category|classification`): 8/8 correct vs the shipped 4/8, both TP forms kept.
- **D — drop only sentences whose FACT_ABSENCE subject passes C**, not every FACT_ABSENCE sentence: the
  transportation warning survives.
All four are candidates, not verdicts — B's floor is arbitrary and C's head-noun list is vocabulary; both need
their own break round before they are believed.

**SYMMETRY CHECK — my own fix is validated on n=1, the same charge I level at `DOC_IDENTIFIER`.** C was first
scored against a HAND-TYPED copy of the banked set-aside claim; re-run against the DB bytes (477 chars, never
transcribed) it preserves the true positive — but **the corpus contains exactly ONE real set-aside true
positive**, so C's evidence base is a single specimen. It would be incoherent to fault the identifier condition
for generalizing from one solicitation and then offer C without saying so. Same for A: its only protection for
the TPs is that `PWS KO Appropved` and `WAGE DETERMINATIONS` happen to carry no attachment number — a property
of two filenames, not a law. Say the n out loud for your OWN candidate before proposing it.

## Method notes
- Regions ARE stubs in production: always print the refuting region's RAW TEXT, never just its char count.
- Two probes in the same repo can read two different provenance keys and disagree silently — diff the key path
  before trusting a ground-truth dump. A `|| []` fallback on a wrong key is a fail-open.
- Persisted findings carry NO `id`, and `findingProvenance` skips id-less findings — any offline replay must
  synthesize the ids production has, or it measures a different branch.
