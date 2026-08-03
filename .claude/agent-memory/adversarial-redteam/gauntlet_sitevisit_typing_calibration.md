---
name: gauntlet-sitevisit-typing-calibration
description: Calibration seat on DESIGN-live-sitevisit-typing — design F, panel D; the instrument's "live" config is 32 flags stale vs Railway, the acceptance case is structurally unable to fail, and NON-MANDATORY reads as mandatory in PRODUCTION
metadata:
  type: project
---

Ruled 2026-07-31 on `scripts/audit-ai/DESIGN-live-sitevisit-typing.md` (5th seat, calibration).
Design **F**. Panel round **D**. Probes: `scripts/audit-ai/_rt-sitevisit-fabrication-probe.ts`,
`scripts/audit-ai/_rt-branch-census.ts`.

**THE INSTRUMENT IS NOT LIVE — check this FIRST on any future corpus claim.**
`scripts/audit-ai/live-flags.snapshot.json` (captured 2026-07-23) = 89 `AUDIT_*` keys.
`railway variables --service audit-worker --kv` on 2026-07-31 = **121** valid keys. 32 live keys absent
from the snapshot, 30 of them `true` — incl. `AUDIT_SITEVISIT_MANDATORY_GROUNDED`,
`AUDIT_ELIG_OPERATIVE_EXCERPT`, `AUDIT_COVERAGE_CAP_NOT_MUTE` (the Rule 70 mechanism),
`AUDIT_INCOMPLETE_PRECEDENCE`, `AUDIT_VERDICT_POLE_PRECEDENCE`, `AUDIT_SETASIDE_BACKSTOP`.
Worse: `_instrument.ts` `ARC_FLAGS` **hard-pins 6 of those to `"false"`** inside the config it names
`"live"`, on the stated premise "They do NOT exist on the live worker." Its own docstring says a
measurement under any other configuration "is a statement about a machine nobody operates."
⇒ **re-capture the snapshot before trusting any `applyStampedConfig("live")` number.** Also:
`meta.flags` in run-records carries **2 of 122** flags (41/50 records carry exactly
`AUDIT_PROCUREMENT_TYPE_SECTIONS` + `AUDIT_CHUNKED_INGEST`) — Rule 68's replayability promise is not met,
no banked record can say what configuration produced it.

**PRODUCTION FABRICATION, executed and reproduced.** `\bmandatory\b` matches inside `NON-MANDATORY`
(the hyphen is a word boundary). At live flag state the emitter writes, in the engine's own voice:
*"**Mandatory** site visit … attendance is **non-retroactive** — this **BARS AWARD** unless the firm's
attendance … is confirmed"* over an excerpt reading *"a non-mandatory site visit was held and concluded …
offerors who did not attend remain eligible to propose."* The item-B guard built to demote exactly this
(`AUDIT_SITEVISIT_MANDATORY_GROUNDED`, LIVE=`true`) **fires on the collision and keeps the bar**.
The leak is **4 sites, not 3** — it also defeats `ELIGIBILITY_BAR_RE` (audit-orchestrator.ts:389), which is
UPSTREAM of all the others and is what CREATES the bar. Fixing only `audit-site-visit-patterns.ts` leaves
the false bar being made. See [[feedback_negative_recognizers_leak_on_paraphrase]] — a `(?<!non-)`
lookbehind is a blocklist and leaks on "not mandatory" / "non mandatory" (spaced) / "voluntary".

**The design's evidence table is n=2 SOLICITATIONS presented as 30 findings.** Branch census over 43
measurable records: b1 9 findings / **1 sol**, b2 2 / **1 sol**, b4 10 findings but only 4 records / **1
sol**, b5 9 / **1 sol** — and b1, b2, b5 are all the SAME notice, FA813726R0033 (16 of 50 run-records).
The "correct" row and the "mis-typed" row are one notice replayed. Its own `inputs.source` says the visit
"was held and concluded on May 28, 2026" ⇒ the target branch has **zero** genuine instances.

**The named acceptance case is structurally unable to fail.** AOCSSB26R0023 frozen fixture: 39 findings,
2 mention a site visit, both already `kind=submission / bidder_controls`; **0** findings on L.2.1;
**0 candidates** for `applyClauseKeyedTypingFloor` (needs `eligibility_bar` + `bidder_cannot_move`).
Criterion #4 "must not mute" passes for ANY regex. Same class as
[[feedback_certs_must_be_proven_falsifiable]]. (L.2.1 is in the RFP's **Section L**, char 242,539 of
`AOCSSB26R0023-FULL-SOURCE.txt` — NOT attachment J.2; a seat mis-located it and was right anyway.)

**LAW — the two seats leaned opposite ways and the later case settles it.**
`B-193045` (Edw. Kocharian, Jan 15 1979) at 7 verbatim, confirmed against the GAO PDF: *"the Government
cannot make attendance at a prebid site inspection a mandatory condition of submitting a bid"* (dictum)
and *"the prebid site inspection requirement provides no basis for disqualifying Kocharian."* Protest
SUSTAINED. But it is **IFB No. DMA 800-78-B-0052 — sealed bidding**, and
**`VETcorp--Recon.`, B-412198.2 (May 9 2016) at 6–7 says verbatim: "we clarify that the rule in Kocharian
does not apply to negotiated procurements."** In VETcorp the agency found the proposal **unacceptable for
failure to attend** and GAO **denied** relief (Blue & Gold waiver, 4 C.F.R. § 21.2(a)(1)).
⇒ On an RFP, a mandatory site visit **can** end a bid. "Never a bar as a matter of law" is REFUTED, and
believing it moves the engine toward **LESS declining** — the false-BID direction.
Kocharian also has a **May 10 1979 reconsideration** (58 Comp. Gen. 516): non-attendance may go to
**responsibility**. Cite both or neither.

**THE MUTE'S OWN PREMISE IS REFUTED ON ITS OWN SPECIMEN.** The design mutes branch 1 because "whether the
firm attended is a genuine unverifiable firm fact. Rule 70 case (c) applies." Verified verbatim at
acquisition.gov, `FAR 36.210`: *"A record should be kept of the identity and affiliation of all offerors'
representatives who inspect the site or examine the data."* And FA813726R0033 IS a Part 36 buy — its own
source cites **FAR 52.236-9** and **FAR 52.236-15 (Schedules for Construction Contracts)** verbatim.
Decisive: the notice's UPDATE 01 says verbatim **"3) Sign in sheet has been added to the attachments."**
⇒ the engine is muting a verdict on a fact the solicitation package ITSELF PUBLISHES. That is not case (c)
(unverifiable firm fact) — it is a coverage failure. Under `AUDIT_COVERAGE_CAP_NOT_MUTE` (live=`true`) the
correct output is BID_WITH_CAUTION with the item named. Direction: LESS declining — needs a both-ways cert.
Also: the specimen's own text says *"Proposal Response Date: 08 July 2026 at 2PM CST"* — it **closed 23 days
before** the design was written. The sole "live" specimen is a dead notice.
`FAR 52.236-27` (Feb 1995) verified verbatim: *"urged and expected to inspect the site where the work will
be performed"* — permissive, no eligibility condition. Same for `52.237-1` (in the AOC source, char 164,926).

**How to apply.** (1) Re-capture `live-flags.snapshot.json` before quoting any corpus number.
(2) Count DISTINCT SOLICITATIONS, never findings, before calling a corpus row evidence.
(3) Before accepting an acceptance case, count how many of its findings can even reach the code under test.
(4) On any site-visit / attendance question, the sealed-vs-negotiated split is load-bearing and the engine
does not carry it.
