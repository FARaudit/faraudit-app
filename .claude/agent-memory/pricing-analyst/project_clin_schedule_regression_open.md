---
name: clin-schedule-regression-open
description: The "render an address as a CLIN" defect was still live on audit 583df921 (2026-07-30) despite commit 6eb90f9 claiming the CLIN-schedule fix — verify by rendering, never by the commit
metadata:
  type: project
---

Commit 6eb90f9 "fix(engine): P1 — read the CLIN schedule the solicitation actually states" did NOT clear the defect on the next live run. Audit `583df921-9cd9-4fd9-b56a-4f49aee62eb2` (W9123826QA032, USACE Sacramento groundskeeping, run 2026-07-30) still rendered **CLIN "1810"** — the street number of "1810 Jefferson Blvd" — as a line item in the §05 CLIN structure table, the exact prior-run defect. Same run also dropped CLIN 0004 and all 20 option CLINs (source §B states 26: 0001-0006 + 1001-1005/2001-2005/3001-3005/4001-4005), duplicated 0006, and left the Type / Qty / Period columns empty on every row.

Shape of the bug, as far as the artifact shows it: the CLIN table is populated by **scraping leading digit-runs out of finding text**, not by reading §B. That is why a place-of-performance finding whose text begins "…1810 Jefferson Blvd…" became a CLIN, and why quantities the findings *state in prose* ("52 Each, FFP") never reach the Qty column. Any fix that does not read §B directly will regress again on the next address-shaped number.

**Why:** on a price-only, all-FFP buy the CLIN schedule IS the bid schedule — a wrong one is a fabricated figure and an AUTO-F under PANEL-METHOD, not a cosmetic defect.
**How to apply:** never accept a CLIN-schedule fix on a commit message or a green test. Render an audit whose source contains a street address in a place-of-performance clause and read the §05 table. See [[coverage-counts-docs-read-not-analyzed]] for the sibling trap on the same report.
