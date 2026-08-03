---
name: live-sitevisit-typing-design-ruling
description: KO ruling on DESIGN-live-sitevisit-typing — endorse-with-changes; live site visit IS bidder-controllable (FAR 52.236-27/52.237-1 "urged and expected"; B-193045 dictum), but the floor must be TIME-aware or it ships a false BID on a stale future-tense date
metadata:
  type: project
---

TIER-V design panel, 2026-07-31, ex-ko seat. Verdict **endorse-with-changes**. Unit B endorsed outright
(it implements my own 2026-07-22 banked ruling: site-visit-past = a #575 profile attribute, not a verdict).
Unit A endorsed only with a temporal precondition.

**Why (authority, verified live at acquisition.gov / gao.gov 2026-07-31):**
- No FAR clause makes site-visit attendance an eligibility condition. `52.236-27(a)` and `52.237-1`:
  offerors are *"urged and expected to inspect the site"*. Mandatory-attendance text is agency-local.
- `FAR 36.210`: CO *"should make appropriate arrangements"*; *"If it is not feasible for offerors to inspect
  the site … designate an individual who will show the site"*; *"A record should be kept of the identity and
  affiliation of all offerors' representatives who inspect the site."* → the sign-in sheet EXISTS by regulation,
  so "did this firm attend" is knowable by one email to the KO — unknowable-from-the-doc ≠ unknowable.
- `B-193045` (Edw. Kocharian & Co., 15 Jan 1979), p.7 verbatim: *"the Government cannot make attendance at a
  prebid site inspection a mandatory condition of submitting a bid"* (dictum, citing 52 Comp. Gen. 955 (1973);
  Southeastern Services, B-183108) and *"even if it had not inspected the site at all it would be improper for
  DMA to reject its bid as nonresponsive."* Same view for preproposal conferences: 50 Comp. Gen. 355 (1970).
  Currency caveat: 1979, sealed-bidding/responsiveness posture; agencies still write and enforce these terms.

**How to apply — the four blocking changes, if this design or any successor resurfaces:**
1. **Time, not tense.** A future-TENSE attendable shape is also satisfied by a stale notice whose date already
   passed (SAM notices are not re-tensed). Floor ONLY when a parsed event datetime is in the future; no
   parseable date ⇒ NO floor. Compare instants, not date-parts ([[ultra-b2-temporal-f1-datetime-parse]]).
   This is the money-loss case: stale-future-tense → bidder_controls → committal BID → B&P spent, ineligible.
2. **The gate is the RSVP, not the visit.** Registration deadline is a distinct date and governs
   controllability; RSVP past + visit future ⇒ not bidder-controlled (CO grace, not bidder control).
3. **Access lead time is a third fail-closed override.** EAL/DBIDS/base-access/foreign-national lead time is
   NOT caught by `hasPreAwardPossession` or `hasLongLeadCredential`. Positive-feasibility form only.
4. `RATIFIED_TYPING_CLAUSES` is a shape⇒typing table; a site visit is its first TIME-DEPENDENT member. Do not
   hide a temporal precondition inside a regex — add a `feasible(f, now)` predicate or a separate guarded step.

**Concluded branch (FA813726R0033):** silent NHR is over-conservative. The bar is the weakest class in the
system (no FAR clause creates it; GAO says failure to attend does not require rejection), so it is not
disqualifier-class. Correct output = BID_WITH_CAUTION with the item NAMED + the real remedy: confirm against
the site-visit attendance record (FAR 36.210), and if absent request an accommodation/amendment BEFORE the
proposal due date (a solicitation-impropriety protest is untimely after closing, 4 CFR 21.2(a)(1)).
Could NOT verify that notice live this session (SAM SPA does not render to a fetcher, no shell) — its stated
due date was 08 Jul 2026; re-fetch liveness before using it as an acceptance specimen.
