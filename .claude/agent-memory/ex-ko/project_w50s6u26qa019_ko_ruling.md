---
name: w50s6u26qa019-ko-ruling
description: KO panel ruling on audit eab43ada (W50S6U26QA019 Landscaping, SDVOSB) — grade F; 52.222-42 "equivalent rates" read as a binding wage floor; false Section-E absence; amendment-acknowledgment kill-gate absent
metadata:
  type: project
---

Audit `eab43ada-2baf-49e2-b224-a968df7864f3` · W50S6U26QA019 · notice `1e3e02dbe95e4561a522d902824060d5` · reviewed 2026-08-02. **Grade F, 3 AUTO-F.**

**Why:** the engine's work on the ONE document it read was strong (clause section attribution §I vs §K correct, 12 FFP CLINs correct, §M factors + "approximately equal" correct, deadline exact). Every failure sat in the documents it did not analyze, plus one meaning inversion.

**The class-defining defect — FAR 52.222-42 is not a wage floor.** The engine turned
`Statement of Equivalent Rates for Federal Hires` → "failure to price at or above WG-5003-8 rate of
$29.99/hr ... will result in non-compliant pricing", and cited it to Attachment 0002 / WD 2015-5613,
which it never read. The clause's own boilerplate — quoted in the engine's own excerpt — says
**"This Statement is for Information Only: It is not a Wage Determination."** WG-#### is the *Federal
Wage System* (what a federal employee would earn), never a contractor obligation. Real SCA floor in
WD 2015-5613 R32 (LA County): Gardener 11090 = $23.05, Laborer Grounds Maintenance 11210 = $19.67,
+ H&W $5.55. A bidder using $29.99 overprices the dominant cost element ~50% on an FFP grounds buy.

**Why:** an excerpt that NEGATES its own claim passed Rule 64 — grounding checks the excerpt exists,
not that it supports the assertion. Same failure family as [[feedback_grounding_checks_excerpt_not_claim]].
**How to apply:** any finding whose excerpt contains "information only", "not a wage determination",
"for reference", "estimate", "not binding" must be barred from becoming a GATE. Treat the FAR clause
family 52.222-42 / 52.211-x estimates / "Government estimate" tables as a named non-binding class.

**Other durable lessons banked here**
- **Section E false absence.** Bottom line said "binding section(s) not located: E" — `Section E -
  Inspection and Acceptance` is a literal header in the very PDF 63 findings came out of. A section
  the map-reduce digest dropped was reported to the customer as absent from the SOURCE.
- **"could not be confirmed read in full (unfetched, scanned/no-text, or truncated)"** was rendered
  over 7 docs the engine's own record says were READ IN FULL. I re-fetched 4 of them: WD 41,879
  chars, both SF-30s ~11k, Q&A 1,308 — all clean text layers. The stated CAUSE is false, and the
  customer reads it as "unreadable."
- **Coverage arithmetic self-contradicts on the face:** "10 of 12 documents could be read" sits three
  lines above a list naming 7 of 12 as not read. 10+7 > 12.
- **Primary FORM classified as `Site_Visit_Sign-in...pdf`** (a garbled attendance roster). Consequence
  is not cosmetic: with no anchor to the SF 1449 the report never names the issuing office
  (Block 9 = W7MX USPFO ACTIVITY CAANG 195), never surfaces "OFFEROR TO COMPLETE BLOCKS 12, 17, 23,
  24, AND 30", never FOB Destination, never Block 14 RFQ. The notice body twice says **SF 1449
  PREVAILS** on inconsistency. Also wasted the roster's real value — it is the competitor list.
- **The amendment-acknowledgment kill-gate was absent.** SF-30 Block 11: "FAILURE OF YOUR
  ACKNOWLEDGMENT ... MAY RESULT IN REJECTION OF YOUR OFFER." The string "acknowledg" appears ZERO
  times in the export. #1 admin reason a USPFO tosses a quote.
- **Honest-fail ran inverted.** The engine MUTED the verdict (which was decidable — set-aside, NAICS,
  deadline, 12 FFP CLINs, §M factors, §L channel all correctly captured) while SHIPPING 53 "gates to
  clear" including the fabricated wage floor. Rule 70 says cap at BID_WITH_CAUTION and NAME the
  uncovered item; muting the verdict and publishing the bad finding is the exact inversion.
  See [[feedback_cap_not_mute_no_materiality_classifier]] and [[feedback_nhr_default_is_product_failure]].
- **"UNVERIFIED ABSENCE" hedge fired on findings the engine located VERBATIM** (PoP "Reserved" is
  quoted at PWS 1.3 and hedged as "this audit did not locate it").

**How to apply:** on the next run of this notice, check first (1) does any GATE rest on an excerpt
containing a non-binding disclaimer, (2) is any "section not located" claim testable by grepping the
read PDF for `Section <X> -`, (3) does the report contain the word "acknowledge" for the SF-30s.
