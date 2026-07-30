---
name: covdirect-drycert
description: INDEPENDENT DRY-CERT of AUDIT_COVERED_DIRECT_BAR_FLOOR (covered_direct hard-bar floor, branch phase2-emission-grounding-548, HEAD d35e70b, after R2 belt-tighten). Grade D / NOT-DRY — 1 catastrophic UNDER-FIRE (belt-2 8(a) gap → false-green) + 1 realistic OVER-FIRE (belt-1 fires on "contractor" in a goods-remedy tail, re-opens the R1 §E class).
metadata:
  type: project
---

# AUDIT_COVERED_DIRECT_BAR_FLOOR — INDEPENDENT DRY-CERT (branch phase2-emission-grounding-548, HEAD d35e70b)

**DRY GRADE: D / NOT-DRY.** Attacked afresh with new `_drycert-covdirect-*` probes (prod quartet ON). The template
cert (`_cert-covdirect-prodpath.ts`, 18/18) and the R1→R2→belt-tighten arc closed the ORIGINAL over-fire pair and
the named masking vector, BUT two NEW breaks survive my attack — one catastrophic.

- **UNDER-FIRE (must be 0): 1 surviving — P0/catastrophic false-green.**
- **OVER-FIRE (minimize): 1 surviving — P1/crying-wolf, realistic + broad.**

Grade rationale: an in-scope UNDER-FIRE (ELIGIBILITY_BAR_RE matches a real bidder-disqualifier, recognizer wrongly
SKIPS it → covered_direct → false-green) is a FAIL of the primary contract → D. Not AUTO-F (no fabrication/SAM
contradiction; the floor is a flag-OFF defense-in-depth layer, not the sole set-aside detector), but ship-blocking.

## BREAK 1 — UNDER-FIRE (P0, catastrophic false-green): belt-2 `FIRM_CREDENTIAL_RE` omits a bare `8(a)` token
Probes: `_drycert-covdirect-belt-evasion.ts` · `_drycert-covdirect-8a-isolate.ts` · `_drycert-covdirect-8a-realism.ts`
· re-hit via the acceptance frame in `_drycert-covdirect-acceptance-frame.ts`.

**Mechanism.** `isNonBidderEligibilitySentence` SKIPS a match when `THING_LEAD_RE ∨ ACCEPTANCE_OBJECT_RE` fires and
BOTH belts miss. `FIRM_CREDENTIAL_RE` (belt-2) enumerates `sdvosb|hubzone|wosb|edwosb|service-disabled` and a literal
`set[\s-]?aside` — but **NOT a bare `8(a)`**. `OFFEROR_SUBJECT_RE` (belt-1) enumerates offeror/contractor/firm/
concern/… but **NOT the SBA's own term of art "participant(s)" (nor "entities")**. So a real 8(a) award restriction
that (a) leads with a thing-noun, (b) names the eligible class as "8(a) participants"/"8(a) certified entities", and
(c) omits the literal word "set-aside" → thing-lead fires, both belts miss → **SKIPPED → covered_direct → false-green.**

Proven e2e through real `completenessOf` (prod quartet), self-cert demotion CONFIRMED OFF (`isBidderSelfDeterminableSentence`
returns false — this is NOT an intentional self-cert demotion):
- `"Provisions of this notice restrict award to 8(a) program participants only."` → **SKIP** (covered_direct)
- `"Items under this action are available for award only to 8(a) certified entities."` → **SKIP**
- `"Work is ineligible for acceptance unless performed by an 8(a) participant certified by SBA."` → **SKIP** (acceptance-frame reach)
- vs. `"Only 8(a) program participants are eligible to receive award under this action."` → **FLOOR** (correct — no thing-lead)
- vs. same with "concerns"/"firms"/"offerors" (belt-1) or a "set-aside" token (belt-2) → **FLOOR** (correct)

**In-scope discriminator:** prepending an offeror noun makes the identical bar FLOOR → ELIGIBILITY_BAR_RE matched the
bar body; belt-evasion (not an RE limit) is the cause.

**Realism = HIGH.** "participant(s)" is the SBA's canonical noun for 8(a) firms (13 CFR 124 / FAR 19.8); a §C/§H
restriction reading "restricted to 8(a) participants" without repeating "set-aside" is ordinary prose. Every OTHER
socioeconomic program is belt-2-rescued; 8(a) is the lone gap.

**Severity bound (why D not F):** the flag is default-OFF and this floor is defense-in-depth — a real 8(a) set-aside is
normally ALSO carried by the ratified notice-body floor / `detectSetAsideNotices` / declaredSetAside / clause 52.219-18.
But the CONTRACT for THIS gate is that any RE-matched bar co-resident in {B..H} surfaces here, and it does not.

**Fix (surgical, does not touch the airtight cases):** add `\b8\s?\(?a\)?\b` to `FIRM_CREDENTIAL_RE` (belt-2) — 8(a)
status is a firm-inherent SBA certification a good can never hold, exactly like hubzone/sdvosb. Optionally add
`participants?|entit(?:y|ies)` to `OFFEROR_SUBJECT_RE` (belt-1). Belt-2 alone closes it.

## BREAK 2 — OVER-FIRE (P1, crying-wolf; re-opens the R1 §E class): belt-1 fires on "contractor" in a goods-remedy tail
Probes: `_drycert-covdirect-acceptance-frame.ts` (over-fire section) — 4/4 realistic §E sentences floor.

**Mechanism.** Belt-1 `OFFEROR_SUBJECT_RE` fires on ANY occurrence of an offeror-class noun anywhere in the sentence,
un-scoped to the SUBJECT of the eligibility clause. §E goods-acceptance prose routinely names who bears the remedy in
the tail ("returned **at the contractor's expense**", "removed **by the contractor**"). That lone "contractor" forces
belt-1 → floor, even though the eligibility relationship is about the GOODS ("units are ineligible for acceptance").
This is precisely the R1 §E goods-acceptance over-fire class R2 was built to fix — belt-1 re-opens it.

Proven e2e (§E, prod quartet) — all **FLOOR** (should SKIP):
- `"Nonconforming units are ineligible for acceptance and will be returned at the contractor's expense."`
- `"Supplies not eligible for acceptance shall be removed by the contractor at no cost to the Government."`
- `"Items rejected as ineligible for acceptance will be corrected or replaced by the contractor."`
- `"Data not eligible for acceptance shall be re-submitted by the contractor within 10 days."`
- vs. `"Supplies not conforming to spec are not eligible for acceptance and may be rejected."` → **SKIP** (correct — R2's covered case, no offeror noun)

**Realism = HIGH.** "at the contractor's expense" is ubiquitous FAR inspection/acceptance boilerplate; this over-fires
a clean §E → false-INCOMPLETE (crying-wolf, the cardinal sin per the quantity-ambiguity doctrine).

**Fix:** scope belt-1 to the eligibility CLAUSE'S SUBJECT (offeror noun BEFORE the ineligible/eligible token, or as the
grammatical subject), not anywhere-in-sentence; OR when `ACCEPTANCE_OBJECT_RE`/`THING_LEAD_RE` fires with a thing as the
LEAD subject, require the offeror noun to also lead (not appear only in a remedy tail). Must preserve BREAK-1's floor.

## WHAT HELD (attacked, did not break)
- Multi-bar global scan: two genuine firm-only bars in different sentences BOTH surface; a second ungrounded bar is not
  masked by a grounded first bar (`_drycert-covdirect-multibar-paths.ts`, cases 1-2).
- §B set-aside restriction, §F facility-clearance bar → FLOOR (realistic non-C/H content; cases 3-4).
- read_no_obligation ESCAPE closed: a verb-less bar with NO grounded finding still floors (floor precedes the
  read_no_obligation valve; case 5).
- Self-cert MIS-demotion: size-standard + clearance coupling does NOT demote away the clearance bar → FLOOR (case 6).
- SAM-registration "skip" is the RATIFIED self-cert class (card #516), NOT a belt error — correctly demoted, out of scope.
- ACCEPTANCE_OBJECT frame does NOT mask a real OFFEROR bar (belt-1 correctly floors offeror/contractor/CMMC/debarred).
- R2 over-fire fixes still hold on the ORIGINAL cases (ISO-9001 process spec, TS data-classification, NAICS-listing,
  form-field 8(a), goods-not-eligible-without-offeror → all SKIP).
- Flag-OFF (false AND unset) byte-identical over a mixed multi-section doc.
- ReDoS: no exponential backtracking; ~O(n²) on a degenerate period-less mega-sentence (125→441→1733ms at n=1k/2k/4k),
  linear on real bounded-sentence text. Not a ship-blocker; note only.

## PROBE INDEX (all under scripts/audit-ai/, prod quartet ON, real completenessOf + no stubs)
- `_drycert-covdirect-belt-evasion.ts` — belt-evasion under-fire battery + in-scope discriminator (found BREAK 1)
- `_drycert-covdirect-8a-isolate.ts` — isolates BREAK 1 to the thing-lead + no-belt shape, self-cert=false
- `_drycert-covdirect-8a-realism.ts` — bounds BREAK 1 to the 8(a)/no-set-aside gap; other programs belt-2-safe
- `_drycert-covdirect-acceptance-frame.ts` — acceptance-frame masking (re-hits BREAK 1) + found BREAK 2 over-fire
- `_drycert-covdirect-multibar-paths.ts` — multi-bar/§B/§F/read_no_obligation/self-cert/flag-OFF (all HELD, 10/10)
