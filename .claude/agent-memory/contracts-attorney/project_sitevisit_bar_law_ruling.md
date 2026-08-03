---
name: sitevisit-bar-law-ruling
description: TIER-V design ruling — site-visit attendance is NEVER a bar as a matter of FAR/GAO law; the engine's "this BARS AWARD / attendance is non-retroactive" literal is an unsupported legal conclusion; `\bmandatory\b` matches inside "NON-MANDATORY" and defeats 3 guards
metadata:
  type: project
---

Ruled 2026-07-31 on `scripts/audit-ai/DESIGN-live-sitevisit-typing.md` (Unit A/Unit B, pre-build panel).
Verdict: ENDORSE-WITH-CHANGES on Units A+B; REJECT the design's premise that "branch 1 is correct and stays."

**Why:** the design's own load-bearing premise — that a CONCLUDED mandatory site visit is a bar, so muting is
right — has no support in FAR or GAO. Verified primary text:

- **No FAR provision conditions eligibility on site-visit attendance.** 52.237-1 (presc. 37.110(a)) and
  52.236-27 (presc. 36.523) both say offerors are *"urged and expected to inspect the site."* 36.210 is all
  "should" and directed at the CO. 15.201 assumes non-attendees stay in the competition (conference materials
  *"should be made available to all potential offerors, upon request"*).
- **Sealed bidding:** *Edw. Kocharian & Co.*, B-193045, Jan. 15, 1979 at 7 — *"the prebid site inspection
  requirement provides no basis for disqualifying Kocharian from the competition"*; dictum that the Government
  *cannot* make attendance a mandatory condition of bidding. On recon (B-193045, May 10, 1979) non-attendance
  is at most a **responsibility** factor.
- **Negotiated:** *VETcorp--Recon.*, B-412198.2, May 9, 2016 at 7 — *"the rule in Kocharian does not apply to
  negotiated procurements"* because responsiveness does not apply there. An agency **MAY** find the proposal
  unacceptable; nothing **requires** it. *Arrowhead Constr.*, B-220386, Jan. 8, 1986 — award to a non-attendee
  upheld. ⇒ the answer is **method-dependent and discretionary, never "bars award."**

**Fabrication list (branch 1 literal, `audit-orchestrator.ts:1359`):** "this BARS AWARD" (legal conclusion no
source supports) · "attendance is non-retroactive" (invented term; forecloses the real amendment/second-visit
cure path FAR 15.206 and Arrowhead both show) · the word "Mandatory" (branch 1 gates on
`NOTICE_SITE_VISIT_RE && concluded-marker` — it never tests
`SITE_VISIT_MANDATORY_ATTENDANCE_RE`, so we write the qualifier ourselves. `audit-decide.ts:2722-2726` already
confesses this: *"the bar-status was inferred, not grounded."*)

**Verified recognizer leak — `\bmandatory\b` MATCHES INSIDE "NON-MANDATORY".** The hyphen is a word boundary.
Reproduced in node. Defeats three guards at once on the design's own acceptance specimen
(`gold-sets/AOCSSB26R0023-FULL-SOURCE.complete.txt` L.2.1, "A NON-MANDATORY site visit will be held"):
`SITE_VISIT_MANDATORY_ATTENDANCE_RE` b1 · `audit-force-grounding.ts:124` check (3) · and :128 via
OBLIGATION_MARKER on the neighbouring "MUST register". All three leak in the PERMISSIVE direction.
Same class as [[feedback_negative_recognizers_leak_on_paraphrase]].

**Register-to-attend ≠ eligibility.** "To attend the site visit, all companies MUST register" conditions the
MUST on an optional act. Zero eligibility effect; gate-to-clear at most. Cf. the pattern file's own N6
discrimination case.

**AOC IS NOT A FAR AGENCY.** AOCSSB26R0023 says verbatim: *"the AOC is not subject to the Federal Acquisition
Regulation (FAR), but follows the AOC Contracting Manual."* 40 U.S.C. § 102(5) excludes the Architect of the
Capitol from "Federal agency." It uses AOC-numbered analogues (AOC52.215-1, AOC52.204-5 …) alongside
verbatim-FAR-numbered provisions adopted by the AOC's own manual. Any engine output citing FAR as *binding*
on this specimen is a mis-citation, and GAO hears AOC protests only by nonstatutory consent, not CICA.

**Why:** a customer-facing "this BARS AWARD" on a solicitation term is malpractice-grade in a protest posture —
it is the class of statement a sub relies on to walk away from a bid it could have won.

**How to apply:** on any future site-visit typing work — (1) never let the engine assert bar status the source
does not state; attribute it to the solicitation or don't say it; (2) check both sides of every negation token
before trusting a `\bWORD\b` recognizer; (3) the sealed/negotiated split is load-bearing and the engine
currently does not carry it.
