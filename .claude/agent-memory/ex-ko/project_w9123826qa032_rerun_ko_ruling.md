---
name: w9123826qa032-rerun-ko-ruling
description: KO-lens ruling on audit 583df921 (W9123826QA032 USACE groundskeeping re-run) — header facts CLEAN but 5 AUTO-Fs from a false-absence class + panel assembly bug; grade F
metadata:
  type: project
---

Audit `583df921-9cd9-4fd9-b56a-4f49aee62eb2` (W9123826QA032, notice `ad688e2828814566bb0bcf717b2021b4`, USACE Sacramento groundskeeping, re-run after the F-graded `95698f91`) graded **F** on the ex-KO lens 2026-07-30. The four engine fixes DID land on the header/eligibility layer; they did not touch the two layers that killed it.

**Why:** the header/fact layer is now genuinely clean — set-aside `SBA` (matches SAM `typeOfSetAside` + FAR 52.219-6 at raw 1434; the engine did NOT take the blank SF-1449 "WOMEN-OWNED SMALL BUSINESS (WOSB)" template label at raw 3-4 as a fact), deadline `1 Sep 2026 · 11:00 (UTC−07:00)` exact vs SAM, NAICS 561730, FFP, open-not-closed, BID_WITH_CAUTION with named conditions and no ungrounded NO-BID. Zero fabricated clause numbers across ~40 cites. **Two other layers failed independently:**

1. **False-absence finding class** — three P0/P1 findings assert documents/facts are missing that are IN the assembled source and quoted elsewhere in the same report: PWS "not provided in the assigned source" (PWS at raw 2525, quoted twice by the report), WD "not reproduced ... SCA wage rates unknown" (WD 2015-5631 Rev 27 at raw 2930, Gardener $27.19, H&W $5.55, and the coverage panel says "read in full"), set-aside "not stated in Section B — Sections H/J absence prevents confirmation" (contradicts the report's own header). The `UNVERIFIED ABSENCE — ... this audit did not locate it` hedge does NOT cure a contradiction; the operative sentence a customer reads is still false.
2. **Panel assembly layer is populated by the wrong finding kind** — §L panel carries only `procedural_obligation` findings (row 2 is the post-award DEBRIEFING paragraph under "What must be submitted"); §M panel's single "Factor (descending importance)" is 52.212-2(c) notice-of-award. The CORRECT §L content (52.212-1(a)(1)-(6)) and §M content (Price Only, outlier rejection, options added) exist in the findings array and never reach their panels. CLIN panel promoted the street number **"1810"** (from "1810 Jefferson Blvd") to a CLIN row and shows 6 of 26 line items with Type/Qty/Period columns empty.

**Why this matters:** severity also does not survive render — stored `P0:10, P1:30, P2:13, undefined:23` renders as `60 × "P1 Critical" + 10 × "P2 Advisory"`; no P0 badge exists on the surface. And the header says `Coverage 100% · 3/3 docs` while the same page says `INCOMPLETE / 2 analyzed` and provenance says `Coverage INCOMPLETE`.

**How to apply:** when re-grading this arc, do not treat header-fact fixes as closing it — probe (a) any finding whose text asserts absence, against `finding_provenance` for the same doc, and (b) whether each named panel's rows come from the finding kind the panel's column headers promise. Related: [[feedback_coverage_measures_ingestion_not_analysis]], [[feedback_render_cause_must_derive_from_engine]], [[project_root2_completeness_gate_ruling]].
