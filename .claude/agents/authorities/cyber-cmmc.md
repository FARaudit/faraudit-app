# Authority Pack — DoD Cybersecurity / CMMC
Verified against .gov sources, as-of 2026-06-21. This area is in ACTIVE rollout — verify status live before quoting dates.

## CMMC — rule status + phased rollout
- Program rule (32 CFR Part 170) is FINAL; the DFARS rule cites it as the operative framework. (Program-rule effective date 2024-12-16 is well-established but was bot-blocked on re-fetch -> treat exact date as VERIFY-LIVE.) [acquisition.gov/dfars/subpart-204.75]
- Acquisition rule (48 CFR / DFARS, Case 2019-D041) is FINAL, effective 2026-05-07 — this adds clause 252.204-7021. [Federal Register 2025-17359, 2025-09-10]
- Clause 252.204-7021 current version: NOV 2025.
- Phase-in (STILL ROLLING OUT): until 2028-11-09 the clause is used when the requiring activity assigns a specific CMMC level; on/after 2028-11-10 it applies whenever systems process/store/transmit FCI or CUI (full implementation).
- Three levels: L1 (FCI) = annual self-assessment; L2 (CUI) = self-assessment OR C3PAO third-party (per requiring activity); L3 = DoD/DIBCAC government-led, built on NIST SP 800-172.

## DFARS 252.204-7012 (clause MAY 2024)
- Rapidly report cyber incidents within 72 hours via dibnet.dod.mil.
- Preserve system images + monitoring data >=90 days from incident-report submission.
- Cloud handling CDI: provider must meet FedRAMP Moderate-baseline-EQUIVALENT.
- Requires NIST SP 800-171 "in effect at the time the solicitation is issued" — does NOT hard-code a revision. [acquisition.gov/dfars/252.204-7012]

## DFARS 252.204-7019 / 7020 (NIST 800-171 DoD Assessment + SPRS)
- 7019 (offerors): a current NIST SP 800-171 DoD Assessment (<=3 yrs) must be posted in SPRS to be eligible for award.
- 7020 (clause): keep SPRS scores current; tiers — Basic (self, "Low" confidence), Medium, High (DoD-conducted). Scores reported out of 110, posted in SPRS.

## NIST SP 800-171 / 800-172
- SP 800-171 Rev. 3 — FINAL 2024-05-14 (supersedes Rev. 2). [csrc.nist.gov/pubs/sp/800/171/r3/final]
- KEY NUANCE: DoD Assessment Methodology + 7012 historically pin to Rev. 2; the move to Rev. 3 in DFARS is TRANSITIONAL, not automatic. Controlling revision = whatever is "in effect at solicitation issuance." Verify per solicitation.
- SP 800-172 (Rev. 3) underpins CMMC L3.

## CUI marking (32 CFR Part 2002)
- Final 2016, effective 2016-11-14. Establishes the CUI Program; EA = NARA/ISOO; only CUI Registry markings authorized.
