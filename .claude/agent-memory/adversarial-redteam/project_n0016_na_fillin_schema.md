---
name: n0016-na-fillin-schema
description: N0016726Q1089 CMMC N/A review — a clause's fill-in SCHEMA is ground truth (off-schema "N/A" = patent defect, not clean inapplicability); never anchor a guard on a mis-typed finding; positive anchors need negative gates
metadata:
  type: project
---

Red-team of the N0016726Q1089 NHR failure + Brain #632 N/A-reconciliation fix (2026-07-21). Load-bearing .gov facts (verified live): DFARS 252.204-7025(b)(1) permits exactly FOUR fill-ins (L1 Self / L2 Self / L2 C3PAO / L3 DIBCAC) — "N/A" is OFF-SCHEMA; DFARS 204.7504 says omit 7021/7025 entirely when no level is required. So a solicitation carrying 7021 + 7025 with level "N/A" is INTERNALLY DEFECTIVE (patent ambiguity), not a clean MET.

Reusable rules:
1. **Fill-in schema = ground truth.** Before trusting any grounded fill-in value (CMMC level, set-aside box, wage det), check it against the clause's PERMITTED value set; off-schema values are a defect signal, cap confidence at BWC-with-caution, never "met/already_satisfied."
2. **Never anchor a guard on a mis-typed finding.** #632 anchors reconciliation on an "eligibility_bar/met" that is really an inapplicability determination — category error as foundation.
3. **Positive anchor without negative gates = R2 value-domain hole recurrence.** A reconciliation trigger must also require ABSENCE: no permitted-level token in the same fill-in span (strikethrough menus vanish in extraction), no co-resident grounded level assertion anywhere in the family (option/addendum scope), cite-normalization tolerant (specimen itself had "7025 (b)(1)" with space vs "7025(d)" without — the #539 whitespace-glue seam, live again).
4. **Definitions recitals ("X means-...") must never enter the disqualifier pipeline** — that was the actual NHR driver; N/A-reconciliation only clears the sub-case where a family N/A coincidentally exists.
5. **The class root:** the typing layer is clause-structure-blind (definitions ¶ vs governing fill-in vs dependent sub-obligations all typed as independent sentences) → one clause shatters into 3 contradictory dispositions + duplicate same-excerpt findings with contradictory ctrl. Fix belongs at TYPING time (govern dependents by their grounded trigger), not decide-layer voting. See [[unit6cf-r3-composite-identity]] (contradictory duplicates are the dedup seam's input).
