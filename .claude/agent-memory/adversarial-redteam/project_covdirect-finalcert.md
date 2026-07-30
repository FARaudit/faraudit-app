---
name: covdirect-finalcert
description: FINAL independent DRY-cert of the covered_direct HARD-BAR floor R3 (AUDIT_COVERED_DIRECT_BAR_FLOOR) @4fae5f1 — NOT DRY, grade C, both R3 breaks CLOSED but 3 realistic over-fire families survive (belt-1 adjacency + belt-2 8(a)-reverse pre-empts form-field skip)
metadata:
  type: project
---

# covered_direct HARD-BAR floor — FINAL DRY-CERT (branch phase2-emission-grounding-548 @ 4fae5f1)

**DRY GRADE: C** (NOT DRY). Surviving in-scope breaks: **UNDER-FIRE = 0 · OVER-FIRE = 3 realistic families**.
No AUTO-F (no fabrication, no SAM contradiction, no ungrounded NO-BID; over-fire routes to the SAFE human-review pole).
Flag-OFF byte-identical (proven). ReDoS clean (1ms / 17ms, linear). Builder prod-path probe re-run GREEN (21/21).

**One-line rationale:** R3 closed BOTH prior breaks and left the hard-zero (under-fire) direction airtight, but the two R3 belts each over-fire on ordinary federal prose — belt-1's 30-char adjacency floors benign "firm's/contractor's <thing> … registered/ineligible" logistics sentences, and belt-2's `(program|only|award|…)…8(a)` reverse branch runs BEFORE FORM_FIELD_8A_RE and floors benign form-field/program-reference prose the form-field skip was built to catch → false `obligations_ungrounded`/INCOMPLETE on clean §D/§E/§F.

## R3 remediations — VERIFIED CLOSED
- **BREAK 1 (P0 under-fire)** bare 8(a) PROGRAM restriction thing-lead ("restrict award to 8(a) program participants only", "restricted to firms holding an 8(a) designation") → FLOORS. CLOSED (FIRM_CREDENTIAL_RE 8(a)-program branches, both directions).
- **BREAK 2 (P1 over-fire)** §E goods-acceptance + contractor REMEDY tail ("Nonconforming units are ineligible for acceptance and will be returned at the contractor's expense") → stays covered_direct. CLOSED (subject-scoped belt-1, ≤30-char adjacency).

## SURVIVING OVER-FIRE FAMILIES (all in-scope: ELIGIBILITY_BAR_RE matches; all proven through REAL completenessOf)
1. **Belt-1 adjacency over-fire (§E/§F logistics).** Sentence LEADS with an offeror noun (so THING_LEAD_RE=null) and an eligibility token sits ≤30 chars away → belt-1 forces floor though the sentence is benign work-product prose:
   - "The firm's samples shall be registered in the tracking log upon delivery." (firm@4 ↔ registered@28, dist 24)
   - "Contractor personnel shall be registered in the visitor system."
   These are ordinary §E/§F obligations about SAMPLES/PERSONNEL logistics, not bidder SAM-registration bars.
2. **Belt-2 8(a)-reverse over-fire (§D form-field / program reference) — ORDERING DEFECT.** FIRM_CREDENTIAL_RE runs FIRST (line 1527 `if (FIRM_CREDENTIAL_RE.test) return false`), so its reverse branch `(participant|concern|program|certif|eligib|restrict|award|competition|limited|reserved|only)[^.!?]{0,25}?8\s?\(?a\)?` pre-empts the FORM_FIELD_8A_RE skip meant for exactly these:
   - "The program described in block 8(a) shall be delivered per schedule." (program…8(a))
   - "Enter the applicable program identifier in field 8(a) of the DD-250."
   - "Reference the program element in field 8(a) of the exhibit."
   - "The offeror's program manager shall be identified in item 8(a)."
   - "Only block 8(a) requires an entry." (only…8(a) — belt-2 pre-empts form-field skip)
   Benign form-block "block 8(a)"/"item 8(a)" without a reverse-branch keyword nearby still SKIP correctly (e.g. "Enter the contract line item in block 8(a).") — so the defect is specifically the reverse branch beating the form-field belt.

## DOWNSTREAM CONSEQUENCE — MEASURED (not inferred; _final-covdirect-v2consequence.ts)
Re-ran real gradeCoverageV2 on the over-fire fixtures themselves. Each benign sentence escalates end-to-end in BOTH gates:
- B1 firm's samples (§F): status=obligations_ungrounded · V1 missing=["F"] · **V2 grade 1.0→0.5 · disqualifierUncovered=1**
- C1 program in block 8(a) (§D): obligations_ungrounded · V1 missing=["D"] · **V2 grade 0.5 · disqualifierUncovered=1**
- C2 program identifier field 8(a) (§D): obligations_ungrounded · V1 missing=["D"] · **V2 grade 0.5 · disqualifierUncovered=1**
- BASELINE clean §D (no over-fire): covered_direct · missing=[] · V2 grade 1.0 · disqualifierUncovered=0
So the over-fire is not merely a status flip — it manufactures a false UNCOVERED-DISQUALIFIER in the V2 prod path on benign form-field/logistics prose. Confirms the C severity (recurring false-INCOMPLETE/escalation), still the SAFE pole (escalate, not fabricate a NO-BID) → not AUTO-F.

## OUT OF SCOPE (ratified-detector limit, NOT counted)
- "Bidders must … demonstrate that it is qualified." / "§D marking benign (MIL-STD-129R)" — ELIGIBILITY_BAR_RE never matches → pre-existing detector limit, correctly not floored.

## Severity / why C not F, why not A
- Direction is SAFE (over-fire → covered→human-review, per line 1498). No hard verdict fabricated. → not AUTO-F.
- BUT these are REALISTIC, recurring §D/§E/§F sentences (form-field 8(a) refs and firm/personnel/sample logistics appear in most sols) → false-INCOMPLETE = the crying-wolf cost the quantity-ambiguity doctrine warns against. Multiple realistic over-fires ⇒ not DRY/A.
- Hard-zero (under-fire) direction is airtight (0/many attacks incl. adjacency-window dodge, 8(a) program-word dodge, thing-lead real bars, multi-bar §H).

## Recommended fixes (for the builder, non-blocking of the safe pole)
- **Belt-2 ordering:** run FORM_FIELD_8A_RE (and a "program described in / program identifier / program element in <form-word> 8(a)" guard) BEFORE the belt-2 8(a) reverse branch, OR anchor the reverse branch to a restriction verb (restrict/limit/reserve/set-aside/award-to) rather than bare "program/only/award/certif" co-occurrence.
- **Belt-1 adjacency:** require the eligibility token's SUBJECT to be the offeror (not just within 30 chars) — e.g. reject when the offeror noun is a genitive possessor of a THING ("firm's samples", "contractor's lots") or when a THING_LEAD noun intervenes between the offeror and the eligibility token.

## Probes (independent, prod quartet armed, real completenessOf + gradeCoverageV2, no stubs)
- `scripts/audit-ai/_final-covdirect-seams.ts` — 17 assertions; 14 pass / 3 fail (B1, C1, C2 over-fire).
- `scripts/audit-ai/_final-covdirect-realism.ts` — belt-2/belt-1 realism confirmations through engine.
- `scripts/audit-ai/_final-covdirect-flagoff.ts` — flag-OFF byte-identity + ReDoS (1ms/17ms).
Continues [[project_covdirect-drycert]] (prior D/NOT-DRY that fed R3).
