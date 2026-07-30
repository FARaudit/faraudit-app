---
name: panel-d0664ba2-gate4-adjudication
description: Gate-4 red-team adjudication of audit d0664ba2 (SPRRA2-26-R-0034, sole-source Raytheon) — F upheld on 2 verified AUTO-Fs; C3 downgraded from AUTO-F to FAIL; C5 trimmed
metadata:
  type: project
---

Gate-4 panel adjudication (2026-07-26), card #746 sole-source NHR-conditional, audit d0664ba2.
F UPHELD — not panel pile-driving: two AUTO-Fs each re-verified directly against source by red team:
(1) "DFARS 215-2" mis-numbered cite (source says FAR 15.408 Table 15-2; DFARS 215.2 = "Solicitation and
Receipt of Proposals" confirmed live at acquisition.gov; report's truncated excerpt starting at "15-2,"
MASKS the correct cite — aggravates, not cures). (2) "deadline Jan 29 2025 in the past = universal
show-stopper" — real source string (source's own typo for 2026) but the engine's added conclusion
contradicts live SAM (responseDeadLine 2026-07-31, active) AND its own 8/8 read (AMD 001 extension) AND
its own masthead. Classic amendment-supersession failure: stale quoted date promoted over its own read
of the superseding amendment.

Calibration rulings that differ from the 7 lenses: C3 "authorized distributor at fixed transfer
pricing" (0 grep hits, originates in engine v3.reason) = fabrication-class invented eligibility path,
FAIL — but NOT an enumerated AUTO-F (not a clause/figure/date, no SAM contradiction; grade already F).
C5 interest-door (rawtext "a formal solicitation will be issued to accommodate that supplier") is a
real written CO commitment and a genuine miss, but the panel over-promised it — it is conditional on
capability to supply export-controlled Raytheon PNs (JCP cert gate) — surface it WITH that caveat.

**Why:** seven independent Fs converging is exactly when shared-assumption pile-driving is most likely;
here it wasn't — but 2 of the 7 lenses' charges still needed downgrading.
**How to apply:** when adjudicating convergent AUTO-F claims, re-verify each against the enumerated
rubric gates separately; "fabrication-adjacent" ≠ enumerated AUTO-F; a truncated verbatim excerpt under
a wrong cite is an aggravator (fake corroboration), check where excerpts START. Engine defect classes
confirmed live: excerpt-truncation-derived figures (FY27–FY30 from an excerpt that dropped the FY26
head columns; "50 min" from the wrong xlsx row in an ECU audit), meaning-inversion of cell text
("quantities TBD based on price breaks" → "price breaks TBD based on quantities"), and
coverage.required/covered/missing ALL empty while coreMissing=[C,L,M] (UCF template off-domain on a
Letter RFP). Related: [[gauntlet_veto_narrow_endround]].
