---
name: phase5-passiveframe-r2-overfire
description: Phase 5 passiveFrameEligBarSentence R2 over-fire hunt — broadened consequence vocab (bare \bmandatory\b, condition-of-access, contingent-on, bare \bineligib) opens realistic crying-wolf over-fires
metadata:
  type: project
---

Phase 5 detector `passiveFrameEligBarSentence` @ src/lib/audit-orchestrator.ts:1648 (flag `AUDIT_ELIG_BAR_PASSIVE_FRAME` default-OFF). R1 drove over-fire→0 via POSITIVE eligibility-consequence gate; R2 hunt found the broadened `PASSIVE_ELIG_CONSEQUENCE_RE` (@1593) re-opened crying-wolf over-fires.

**Verdict: NOT DRY — over-fire re-opened. Corpus @ ceo/phase5-gauntlet/redteam-R2-overfire.json (24 specimens, 19 skip / 5 flag). Probe-confirmed 16 of 19 skips FLAG in production.**

**Root over-fire families (all crying-wolf, the cardinal sin):**
1. **bare `\bmandatory\b` (@1605)** — unbounded token, fires on ANY credential-noun sentence where "mandatory" attaches to something benign: mandatory pre-proposal attendance (r2-01), mandatory safety training (r2-02), mandatory recurrent testing (r2-12), Berry-Amendment compliance-is-mandatory perf spec (r2-22). MOST PROLIFIC.
2. **`condition of access` (@1603)** — fires on PHYSICAL site access (r2-03 "condition of access to Building 7") and IT-system access (r2-13 2FA to FedRAMP env) — performance/logistics gates, not bid gates.
3. **bare `\bineligib` (@1594)** — fires in NON-bidder senses: equipment ineligible for warranty (r2-05), person's clearance-eligibility revoked under SEAD 4 (r2-06).
4. **`contingent (up)on` ANCHOR-DEFEATS-CURE (@1602 + @1644)** — r2-11: a maintain-throughout-performance ITAR obligation has BOTH cure ("throughout the period of performance") AND "contingent on"; but PASSIVE_PRE_AWARD_ANCHOR_RE lists `contingent (up)on` as a pre-award anchor → cure-skip (line 1653: cure && !anchor) is DEFEATED → consequence fires. Also r2-04 funding-contingency + TS/SCI.
5. **copula/possession govern without SUBJECT check** — r2-08 "only personnel HOLDING a secret clearance may access/escort" (site rule, possession-govern fires); r2-14 "lower-tier supplier shall BE AN authorized distributor" (sub flow-down, copula-govern fires, not the prime).
6. **`(is|are) not acceptable` (@1615)** — r2-10 substitute PARTS not-acceptable (product conformance) with NO timing word → post-award-cure misses.
7. **`precondition`/`disqualif` non-bidder** — r2-09 precondition-to-receiving-workstation-image; r2-17 operator disqualified from SAP (person-level).
8. **self-cert coupled** — r2-16: reps-certs/SAM "ineligible" COUPLED with ITAR noun; isBidderSelfDeterminableSentence TEST(4) positive-coverage treats "ITAR-controlled requirement" as residual bar-noun → does NOT demote → "ineligible" fires.

**SINGLE BEST over-fire = r2-11** (contingent-on anchor defeats the cure-skip — a structural interaction bug, not just vocab breadth; a performance-renewal contingency misread as a bid gate).

**Real-bar recall HELD (5 flag controls all FLAG):** r2-08b (offeror FCL reading-room access), r2-18 (TDP restricted to DDTC/FCL firms), r2-19 (award contingent on FCL-at-award). Correct-SKIP controls also held: r2-07/15/20/21/23/24 (copula-source, clean cure window, incumbent-narrative, scope-tight eligible arm, passive-voice copula).

**Prescribed fixes (POSITIVE-invariant per treadmill doctrine):** (a) `mandatory`/`condition of access`/`precondition`/`ineligible`/`disqualified` must be SUBJECT-SCOPED to an offeror/firm/award action, not fire on the bare token near a credential noun — i.e. gate the consequence on an offeror-directed grammatical subject the way R1's covered_direct belt-1 was re-anchored; (b) drop `contingent (up)on` from PASSIVE_PRE_AWARD_ANCHOR_RE (it defeats cure) OR require it to co-occur with award/offeror; (c) copula/possession-govern should check the clause subject is the offeror (not personnel/sub/equipment). Probe harness: /tmp/probe_r2.mjs (standalone regex clone).
