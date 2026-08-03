---
name: wage-determination-produces-zero-findings
description: On 4 audits across 2 solicitations the SCA wage determination was read mode="full" and produced exactly 0 attributed findings — and on the newest one the engine filled the gap with the FAR 52.222-42 decoy figure that says "It is not a Wage Determination"
metadata:
  type: project
---

**Deterministic, reproducible, 4-for-4.** Every audit checked whose package contains an SCA wage determination shows the same row in `compliance_json.read_modes` — `{mode:"full", name:"<the WD>"}` — and exactly **0** entries in `compliance_json.finding_provenance` attributed to it:

| audit | solicitation | WD file | findings from it |
|---|---|---|---|
| `95698f91` · `583df921` · `61aaaa95` | W9123826QA032 | `WAGE DETERMINATIONS - 20260513.pdf` | 0 / 0 / 0 |
| `eab43ada` | W50S6U26QA019 | `Attachment_0002_SCLS_WD_2015-5613_R32_20260513.pdf` | 0 |

Not run-to-run variance — three runs of the same solicitation all produced 0. The WD is machine-readable (41,879 chars via `pdftotext -layout` on 2015-5613 R32) and its text IS in `raw_pdf_text`; the loss is at the analysis stage, not ingestion. Same shape for the price-submission workbook and the Q&A attachment on `eab43ada`: read full, zero findings.

**THE DECOY — this is the part that turns a gap into a fabrication.** Army/ANG service RFQs carry FAR **52.222-42 Statement of Equivalent Rates for Federal Hires**, a table of federal **WG-grade** rates printed under the literal heading *"This Statement is for Information Only: It is not a Wage Determination."* It imposes **no** contractor obligation (verified: eCFR 48 CFR 52.222-42; the pay obligation is 52.222-41(c) keyed to the *attached* WD). On `eab43ada` the engine, having grounded nothing in the real WD, emitted a `gate_to_clear` reading *"WD 2015-5613 … sets minimum labor rates; failure to price at or above WG-5003-8 rate of $29.99/hr plus fringe will result in non-compliant pricing"* — citing `Attachment 0002`, which contains **no `$29.99`, no `WG-5003`, and no `WG-` string at all**. Real floors in that WD: 11210 Laborer, Grounds Maintenance **$19.67**, 11090 Gardener **$23.05**, H&W **$5.55** (or **$5.09** where EO 13706 / 52.222-62 applies). The fabricated floor overstates fully-fringed direct labor by **26–44%**.

Note `excerptPreReground` vs `excerpt` on that finding: regrounding **prepended** "It is not a Wage Determination" to the excerpt and the claim survived anyway — a Rule 64 pass on a finding whose own excerpt refutes it in its first line.

**Why:** on a labor-dominated services buy the WD *is* the price. Zero findings from it means the customer cannot build a cost volume; the decoy means they build a losing one and believe it is the compliance floor.
**How to apply:** on any SCA/DBA package, tally `finding_provenance` by doc BEFORE reading the report, and grep the report for `52.222-42` / `WG-` / an equivalent-rates figure. A wage claim whose citation names the WD must be substring-checked against the WD's own text — the citation naming a document is not evidence the figure came from it. Related: [[clin-schedule-regression-open]], [[coverage-counts-docs-read-not-analyzed]].
