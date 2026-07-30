---
name: arc747-e1-head-reground-ruling
description: ARC #747 E1 head-side excerpt re-grounding — PARTIAL; the same-physical-line rule is misaligned with the defect class, tabular source must be REFUSED not repaired, and no gate-4 defect closes because the assertion is never re-derived
metadata:
  type: project
---

Ruling on branch `arc747-e1-head-reground` (`53556d8`), DRY over 5 stored audits / 350 excerpts / 29 head-clips.

**The change is safe and verbatim-only — and closes zero gate-4 defects at the assertion layer.**

**Why:** an excerpt is *evidence*; the thing a KO challenges is the *assertion printed above it*. E1 moves
the quote's left edge and never re-derives `requirement`. So:
- **C1** — restoring `"Submission shall be in accordance with FAR 15.408, Table "` destroys the fake
  corroboration (real win, the most dangerous shape in the record) but the gate still prints "DFARS 215-2".
  Confirmed live at acquisition.gov: FAR 15.408 has Table 15-2; DFARS subpart 215.2 does not. → PARTIAL.
- **S2** — restores 4 chars (`"Min "`). FY26 is two physical lines up; the repair refuses newlines. → UNTOUCHED.
- **S7** — restores `"It is requested that a "` (22 ch of connective). The 5-business-day intent-to-respond
  sits behind a `days.` terminator that stops the backward walk. → UNTOUCHED.

**Three durable structural findings:**
1. **A physical line is not a clause.** On pdftotext output the newline is the extractor's wrap width. Same
   defect shape, opposite outcome by luck: d0664ba2 recovers "FAR 15.408, Table" (same line) while a7727dfc
   recovers only `"Charges,"` because "In accordance with FAR clause 52.215-22, Limitation on Pass-Through"
   wrapped one line up. Same-line-only cannot close the class it was built for.
2. **Tabular source must be REFUSED, not repaired.** d0664ba2 raw L413–423 flattens to FY-first cells
   `FY26 Min | FY26 BEQ | FY27 Min | … | FY30 BEQ`. Restoring `"Min "` glues an orphan qualifier to the wrong
   year and makes a garbled quote *look* like a legible header. Detector needs a column-fragment guard.
3. **The best restores are in the lens production excludes.** `REPAIR_EXCLUDED_LENSES` drops
   `deterministic_sweep`; 15 of the 29 DRY hits are sweep findings, and they hold the cleanest repairs
   (mid-word "T", split solicitation number, dangling parenthetical). Persisted v3 findings carry no `lens`,
   so the DRY *cannot* apply the exclusion — its "29 head-clipped" is ~2× the production yield. The DRY header
   discloses this; the commit bullet and the arc framing do not carry the caveat forward.

**How to apply:** treat span re-grounding as a *precondition*, never as a defect closure. Any future claim
that E1 "closes C1/S1/S2/S3/S7" is refuted by this record — items 3 (no-derivation-from-window) and 4
(row-label alignment) are where the customer-visible harm actually lives. See
[[feedback_excerpt_start_truncation_fakes_corroboration]].
