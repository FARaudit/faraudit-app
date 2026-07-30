---
name: gauntlet-arc747-e1-head-reground
description: ARC #747 E1 head-side excerpt re-grounding red-team — branch moved 3x mid-review; 4 of my own claims retracted; one P1/P0 survives at 88c88ce (excerpt widening silences two ARMED eligibility floors)
metadata:
  type: project
---

Branch `arc747-e1-head-reground`. Verdict at `88c88ce`: **merge flag-off YES · ARM NO (one ground).**

**PROCESS LESSON — the most valuable output of this review.** The branch moved THREE times while I
was probing (`53556d8` → `3045948` → `88c88ce`). A corpus statistic silently went 70 → 17 → 13
across runs of the SAME probe. I nearly shipped "66% of rewrites mis-attribute a clause date."
What caught it: **running the same probe twice and diffing the number**, then `git rev-parse HEAD`.
Checking `updated_at` on the data rows (unchanged) proved the drift was CODE, not data.
**Standing rule for long reviews: print the SHA from inside the probe process, re-run every stated
number at the end, and re-run the whole battery after any HEAD change.** Then the tree was switched
OFF the branch entirely (to `688801c` / `fix-report-dedupe-facet-loss`), which made one of the
author's cert scripts appear to crash — **an environment artifact I nearly reported as a defect.**
Before filing "script X is broken," confirm the file exists at the SHA you think you are on.
The reviewed work lives at branch `arc747-e1-head-reground` = `88c88ce`.

**FOUR OF MY OWN CLAIMS RETRACTED on re-verification** — each failed the same way: I built the claim
from a plausible mental model instead of from the real artifact.
1. "46/70 (66%) rewrites glue the prior clause's date onto a §I cite" — measured on a stale SHA, and
   its mechanism was refuted by my own line scan (237 lines carry exactly 1 clause number, 3 carry >1).
2. "the two eligibility floors are un-flagged" — read the FUNCTION, never the CALL SITE (`:2520`).
   Always grep the call site before grading a guard's flag exposure.
3. "`==== DOCUMENT: … ====` leaks into excerpts" — production emits `\n\n==== … ====\n\n`
   (`agentic-executor.ts:159`); `wrapRegionStart` stops at the blank line. My fixture used a single `\n`.
4. "Long single-line table rows are fused, proven by the record" — the record's table extracts as
   ≤40-char fragments per line (`"FY26"`, `"Min FY26"`), which IS refused. My long-row was invented.

**STILL OPEN at `88c88ce` (all re-executed there):**
- **P0** — excerpt widening launders an ungrounded eligibility bar. `noticeBodyEligibilityUngrounded`
  (`:1113`, call site `:2520` gated on `AUDIT_NOTICE_BODY_ELIG_FLOOR`) and `sectionUngroundedEligBars`
  (`:1873`, gated on `AUDIT_COVERED_DIRECT_BAR_FLOOR`) decide
  "analyzed" by excerpt **span overlap**; a legitimate multi-line prose wrap widens that span across a
  co-located bar. Executed: notice floor `true → false` on a Top-Secret clearance bar. The author
  independently found the same FAMILY (`isPositiveSetAside` flipping) and guarded it by refusing row
  SHAPES — but shape-refusal cannot fix this, because a legitimate prose wrap is the feature.
  **Both floors are ARMED in production** — `railway variables --service audit-worker --kv` shows
  `AUDIT_COVERED_DIRECT_BAR_FLOOR=true` and `AUDIT_NOTICE_BODY_ELIG_FLOOR=true`
  (`AUDIT_EXCERPT_HEAD_REGROUND` absent) — so arming the head flag puts it straight into contact
  with two live floors. Reachability measured on the corpus: 4,851 lines the walk would absorb,
  **35 carrying eligibility-bar language**; the conjunction (bar line directly above a head-clipped
  excerpt) was NOT observed in the 13 real rewrites. (First measured 29 with a hand-copied regex —
  **extract the regex literal from the source file instead of retyping it**; the real one is 1,709
  chars and my copy silently dropped arms.)
- P1 — no tail-truncation precondition; rewrites `"…exceed $1,204."` into a complete-looking wrapped
  sentence. `isTruncatedExcerpt`'s `/\$\d+\.$/` misses the thousands comma so the gate never fires.
- P2 — two-column prose fusion; `HEAD_ENDS_TERMINATED` unmasked (`"U.S."` head ⇒ silent miss) while
  `clauseStartInHead` is masked; `HEAD_ENDS_ENUMERATOR` false-positive on `(b)` cross-refs;
  `normMap`/`canon` desync on U+0130 (only BMP char whose lowercase is longer) ⇒ span overruns.

**Standing lesson: any pass that mutates `finding.excerpt` is a VERDICT-layer change** — excerpt spans
are the coordinate system for the eligibility floors and for `isPositiveSetAside`.

**Refuted, do not re-litigate** (all re-executed at `88c88ce`): flag-OFF byte identity (sole caller is
the gated `audit-orchestrator.ts:2475`); idempotence/convergence; `covered_direct` floor no-flip;
`maskGuards` length preservation; and **obligation-coverage inflation — refuted BY EXECUTION**: the
walk is blocked wherever a terminator separates two obligations, and where no terminator separates
them `obligationsOf` also sees ONE obligation, so there is never a second obligation to falsely
cover. Zero coverage delta across all three separator variants.

**Corpus caveat:** only 5 of 101 `audits` rows carry both `raw_pdf_text` and
`compliance_json.v3.findings` — 350 excerpts, 13 rewrites at `88c88ce`, 7 with multi-line heads.
Thin evidence base; treat prevalence numbers as indicative, not settled.
