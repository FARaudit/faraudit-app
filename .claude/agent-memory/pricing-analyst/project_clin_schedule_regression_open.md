---
name: clin-schedule-regression-open
description: The "render an address as a CLIN" defect was still live on audit 583df921 (2026-07-30) despite commit 6eb90f9 claiming the CLIN-schedule fix — verify by rendering, never by the commit
metadata:
  type: project
---

Commit 6eb90f9 "fix(engine): P1 — read the CLIN schedule the solicitation actually states" did NOT clear the defect on the next live run. Audit `583df921-9cd9-4fd9-b56a-4f49aee62eb2` (W9123826QA032, USACE Sacramento groundskeeping, run 2026-07-30) still rendered **CLIN "1810"** — the street number of "1810 Jefferson Blvd" — as a line item in the §05 CLIN structure table, the exact prior-run defect. Same run also dropped CLIN 0004 and all 20 option CLINs (source §B states 26: 0001-0006 + 1001-1005/2001-2005/3001-3005/4001-4005), duplicated 0006, and left the Type / Qty / Period columns empty on every row.

Shape of the bug, as far as the artifact shows it: the CLIN table is populated by **scraping leading digit-runs out of finding text**, not by reading §B. That is why a place-of-performance finding whose text begins "…1810 Jefferson Blvd…" became a CLIN, and why quantities the findings *state in prose* ("52 Each, FFP") never reach the Qty column. Any fix that does not read §B directly will regress again on the next address-shaped number.

**Second manifestation — audit `eab43ada` (W50S6U26QA019, 2026-08-02).** CLIN numbers, FFP type, and all 12 qty/unit pairs were CORRECT this time, so the digit-scrape shape above appears to be gone. What ships broken now is the **Title** column: it carries only the FIRST PHYSICAL LINE of §B's description cell. Titles truncate mid-phrase ("Provide premium mulch in", "Provide desert willow tree"), and where a **page break** falls between the CLIN number and its wrapped description — 0003 and 0010 in that §B — the title renders **empty**. Worst effect: 0009/0010/0011 are three sequential 30-day establishment-watering windows ("days 1 through 30 / 31 through 60 / 61 through 90") and render as `establishment` / *(blank)* / `establishment` — indistinguishable, so a bidder cannot tell they are three separately-priced periods.

**The fix material is already ingested.** `Attachment_0004_Quoted_Price_Submission_Form.xlsx` carries the identical schedule with each description in ONE cell, unwrapped, plus `Total Quoted Price {=SUM(F5:F16)}`. The engine read it `mode:"full"` and drew zero findings from it — see [[wage-determination-produces-zero-findings]]. Parse the price-submission workbook for the bid schedule instead of scraping the §B PDF layout.

**Why:** on a price-only, all-FFP buy the CLIN schedule IS the bid schedule — a wrong one is a fabricated figure and an AUTO-F under PANEL-METHOD, not a cosmetic defect.
**How to apply:** never accept a CLIN-schedule fix on a commit message or a green test. Regression-test BOTH shapes: a source with a street address in a place-of-performance clause (digit-scrape), and a §B whose description wraps across a page break (blank-title). Read the §05 table in the rendered export. See [[coverage-counts-docs-read-not-analyzed]] for the sibling trap on the same report.
