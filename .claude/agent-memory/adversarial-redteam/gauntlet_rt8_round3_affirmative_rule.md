---
name: gauntlet-rt8-round3-affirmative-rule
description: RT8 ROUND 3 (9333902) — the affirmative subject rule closed all four round-2 vectors but still over-refutes 4 ways; identity is name-tokens-only and the residue test only counts ASCII letters. Grade D, do not arm.
metadata:
  type: project
---

# RT8 ROUND 3 — `assertsDocAbsent` rewritten as an AFFIRMATIVE shape rule (branch `claude/rt8-code-review-fixes` @ 9333902)

**What the rule is:** take the span from the last `[.;:—–]` before the absence predicate up to the predicate;
strip parentheticals, the matched region's own name tokens, and bare determiners; fire only if the residue
contains no `[A-Za-z]`.

**What it actually tests** (the root of every break below):
`subject_span ⊆ tokens(matched_region_name) ∪ determiners ∪ digits ∪ punctuation ∪ non-ASCII letters ∪ parentheticals`
It never checks (i) that the region IS the document the claim names — SUBSET, not equality, so a region whose
name is a token-superset refutes; (ii) anything RIGHT of the predicate; (iii) any non-letter distinguisher;
(iv) the region's CONTENT — identity is filename tokens only.

## CREDIT — the round-2 vectors are genuinely dead
All 4 stand down under the new rule (executed, not assumed): `PWS is complete and the drawings are not provided` ·
`Appendix C to the PWS is not attached` · `The PWS's appendix is not attached` · `The drawings and the PWS are not
provided`. Shipped suite 34/34. **An affirmative recogniser really did beat the negative-guard treadmill** — the
remaining defects are a different class (identity/alphabet/span), not another paraphrase leak.

## The four surviving over-refute vectors (all executed; 2 reproduce on UNMUTATED production sources)
1. **Name-token SUBSET** — fires on real data AS POSTED. Run `496a9a21` / FA813726R0033:
   `The register is not provided` → refuted by `ATT12_Submittal Register.pdf`; `The narrative is not attached`
   AND `The design is not provided` → both refuted by `ATT11_260007_Design Narrative.pdf`. Also proven on real
   583df921 bytes with only the PWS region HEADER renamed to `PWS Questions and Answers` — the live AUTO-F claim,
   now TRUE, is refuted and attributed to the Q&A file.
   Calibration: the corpus replayed with VERBATIM filenames gave cross-doc=0, so the vector needs the SHORT-name
   claim form — which is what **all 4** banked AUTO-F claims use (their subject spans are literally
   `pws (attachment 0001)` and `wage determination (attachment 0002)`). Lenses never write filenames.
2. **`/[A-Za-z]/` residue** — digits/`§`/non-ASCII are "nothing else". `Wage Determination 15-5110 is not provided`
   fires against `WAGE DETERMINATIONS - 20260513.pdf` on run 61aaaa95. Corpus holds 3 distinct WD files whose token
   sets are IDENTICAL (`["wage","determination"]`) — a WD's identity is exactly the number the test ignores.
3. **Span is LEFT-only** — `…is not provided for the option periods` fires; and `consequenceOf` keeps only
   post-em-dash text, so the qualifier that made the claim true is also deleted from the output.
4. **Ordinary-word filenames** — `Pricing Sheet.xlsx` refutes "the pricing is not provided for CLIN 0003";
   a blank PPQ refutes "past performance is not provided". Re-imports the CONTENT-claim class the module's own
   header excludes by name. NOTE: my token-SUBSTRING-collision hypothesis for this vector was **REFUTED** —
   `Sign In 05-28-2026.pdf` (token `["sign"]`) does NOT refute "the signage/sign-in sheet is not provided";
   the residue check kills both. Vector 3 is also narrower than first written: `The drawings are not provided
   for the demolition scope` STANDS DOWN, because the plural stem leaves an `s` in the residue.

## MY OWN PROPOSED FIX WAS REFUTED — do not re-propose it
"Require every region-name token to appear in the claim's subject" (equality instead of subset) **destroys 2 of
the 4 banked true positives** — both PWS AUTO-Fs, the very thing the module exists to kill — because the real
filename carries the typo token `Appropved` that no lens will ever write. Real region names are full of tokens no
claim contains: `Appropved`, `ATT10_`, `P07_`, `Raytheon`, `AMD 002`, `SAM.GOV`. **Token-completeness is not
available as a discriminator.** Any candidate rule must be run against the 4 banked true positives AND the
executed break set before it is believed — harness pattern is in the round-3 scratchpad (`rt8r3-fixcheck.ts`):
recompute the subject span exactly as the shipped rule does, then apply the candidate condition to it.

## Other banked results
- **`fitToRender` is correct on the doc arm** (≤400, stable under the renderer's `truncateOnWord`, incl. a 600-char
  spaceless token) — but the **SET-ASIDE arm never calls it**: persisted 593 chars, rendered 395, 198 chars of the
  preserved analysis silently dropped. The exact divergence the module's comment claims to have closed.
- **The #8 park is real and complete** — no `src/`/`agents/` caller, executor reads neither the symbol nor the env
  var, dependency direction is parked→shipping (`audit-force-grounding` imports `fitToRender`), no cycle.
  Two stale artifacts left behind: `scripts/audit-ai/_cert-rt8-wiring.ts` now fails 4/11 asserting the PRE-park
  state, and `scripts/audit-ai/_arm-forcegrounding-vercel.ts` still arms a dead flag.
- **False negatives are all safe-direction** and mostly not worth loosening: `has not been provided` · `was never
  provided` · `is missing` · `is absent` · `could not be located` · `does not appear` · `is not being provided`.
  The one worth fixing is the **plural stem**: `Wage Determinations are not provided` stands down because
  `docTokens` stems to `determination` and the leftover `s` is a letter.

## Method notes worth keeping
- The supplied diff was a 5-file SUBSET of `git diff main...HEAD` (scripts excluded) — not stale this time, but
  regenerate and compare file lists before tracing.
- Running a probe from the scratchpad needs `NODE_PATH=<repo>/node_modules` (node resolves from the FILE's dir).
- The strongest evidence in this round was a **mutation of real bytes** (rename a region header, keep the text),
  not a synthetic source — it converts "the rule permits X" into "the rule does X on this customer's document".
