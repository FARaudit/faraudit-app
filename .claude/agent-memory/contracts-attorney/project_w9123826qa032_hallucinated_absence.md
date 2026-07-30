---
name: w9123826qa032-hallucinated-absence
description: Attorney-lens ruling on audit 583df921 (W9123826QA032 USACE groundskeeping) — clause fabrication is ZERO two runs running, but "UNVERIFIED ABSENCE" fires on documents the run READ AND ANALYZED, and the CLIN table published a street number as a CLIN
metadata:
  type: project
---

Ruling 2026-07-30, audit `583df921-9cd9-4fd9-b56a-4f49aee62eb2`, notice `ad688e2828814566bb0bcf717b2021b4`: **grade F on three AUTO-F triggers, none of them a clause.**

**The clause layer is the strongest part of this engine and should stop being the thing we test.**
Clause-token set-difference (report − source) was **EMPTY** for the second consecutive run — 21 tokens
in the rendered export, 22 in `compliance_json`, every one present verbatim in `raw_pdf_text`.
Incorporation characterization was right on every clause I checked against the source's own section
headers (52.209-2 §K full-text; 52.203-18 / 52.204-7 / 52.237-1 §L by-reference; 252.204-7008 §K rep;
252.204-7012 / -7018 §I). Resolving an incorporated cite to its real content (7012 → "72 hours",
NIST SP 800-171) is correct 52.252-2 practice, not fabrication. **Do not re-litigate this.**

**HALLUCINATED ABSENCE — the new defect class, and the mirror of hallucinated coverage.** The
`UNVERIFIED ABSENCE — … not provided in the assigned source` template fired on **both** attachments
while they sat in the assigned source and while the run's own `finding_provenance` carried three
findings grounded in one of them:
- PWS = `raw_pdf_text` lines 2525–2920; provenance `Counter({'PWS KO Appropved - 20260720.pdf': 3})`.
- Wage Determination = lines 2921–3582, WD 2015-5631 Rev 27, El Dorado/Placer/Sacramento/Yolo, with the
  operative rates (11210 Laborer, Grounds Maintenance 21.01 · 11090 Gardener 27.19).
The hedge ("this audit did not locate it") does not cure the operative sentence, which asserts the
rates "are unknown." **The template is emitted per-lens and never reconciled against the run's own
provenance ledger.** Same shape produced "Set-aside type is not stated … Sections H/J absence prevents
confirmation" while §I 52.219-6 (line 1434) states it and the report's own mast/verdict decode it.

**Fabrication migrated OUT of the clause layer and INTO the CLIN layer.** `<td class="cl-n mono">1810</td>`
— CLIN **1810**, scraped from "1810 Jefferson Blvd" in the place-of-performance string. Section B has
0001–0006 and 1001–1005/2001–2005/3001–3005/4001–4005; there is no 1810. The same table drops CLIN 0004
(Preventive Maintenance) and all 20 option CLINs while a §L finding correctly says all must be priced.

**Traps this run handled WELL — credit them, don't re-flag:** the SF1449 Block 10 preprinted checkbox
labels put "WOMEN-OWNED SMALL BUSINESS (WOSB)" at raw lines 3–4 with the rest of the program names
marooned at 93–102 and the checkbox STATE absent from the text layer. Zero WOSB mentions in the report;
it read the set-aside off SAM `typeOfSetAside` + §I 52.219-6 instead. Deviation clauses were quoted with
their deviation tags intact (2026-O0038 / 2026-O0040 Rev 1) — verified real, and 52.240-90/-91/-93 are
in the FAR-Overhaul Part 52 deviation text while `acquisition.gov/far/52.240-90` is a hard 404.

**7012 BLEED, AGAIN** (see [[cmmc-7025-na-instrument-trigger]]): the report hung "low SPRS score …
long-lead remediation item before award" on 252.204-7012. The SPRS award gate is **252.204-7019(b)/(c)(1)**,
and neither 7019 nor 7020 is in this solicitation. Third specimen of obligations migrating onto 7012.

**How to apply:** on any future run of this shape, spend the review budget on (a) reconciling every
absence-class finding against `finding_provenance` before reading anything else, (b) the CLIN table's
number column, and (c) the omission set — not on hunting fabricated clause numbers. The highest-value
clause-layer miss here was 52.222-43 (SCA price adjustment) colliding with §M's unbalanced-option-price
rejection on a base + 4-option-year price-only buy; the engine cited neither 52.222-41, -43, -62,
52.217-9, 52.217-5, 52.219-6, 52.244-6, 52.252-2, 52.240-91/-93, nor the §K 52.240-90 fill-in.

Related: [[verify-paraphrase-not-just-memory]] · [[747-v2-narrative-registry-ruling]]
