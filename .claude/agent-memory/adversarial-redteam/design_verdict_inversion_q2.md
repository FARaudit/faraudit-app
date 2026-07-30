---
name: design-verdict-inversion-q2
description: "Q2 red-team of the #747 verdict decide-by-default inversion (M1 materiality allowlist / M2 firm profile / M3 conformal abstention) — all three REJECT; 11/11 disqualifier-class constructions demote under M1, proven by executing the SHIPPED importanceOf."
metadata:
  type: project
---

**M1 is not a new mechanism — it is a POLARITY INVERSION of shipped code, and the inverted default fails toward BID.**
`importanceOf` (src/lib/audit-gate-v2.ts:299) already ships the three-way classifier with "Ambiguous defaults to
disqualifier": positive DISQUALIFIER_RE → escalate; positive BENIGN shapes (BOILERPLATE_RE / NOOP_REP / LPTA-release /
`isLedgerDemotableNonBar`, each flag-gated default-OFF) → demote; **residue → ambiguous → escalate.** M1 flips the
default from "demote only what is provably benign" to "escalate only what is provably lethal."

**Executed probe (＄0, no model), 12 real solicitation shapes through the live classifier + a verbatim mirror of
`obligationsOf` (audit-orchestrator.ts:366-368): 11/11 disqualifier-class cases DEMOTE under M1, including BOTH
controls that are IN M1's own stated allowlist** (a set-aside sentence is never swept — no obligation verb; "shall
furnish a bid guarantee" types *boilerplate* because BOILERPLATE_RE:51 matches `shall furnish`). Arming
`AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD` changed NOTHING (hasBarSignal negative on all 11).
**Why "ambiguous → material" cannot save it:** materiality is carried by a CONSEQUENCE clause in a *separate sentence*
that usually has no obligation verb, so it never enters the sweep at all; the surviving obligation sentence types
CONFIDENTLY boilerplate. Only 1/11 reached the ambiguous band. Confident non-membership ≠ ambiguity.

**M2:** `BidderProfile` (audit-findings.ts:184) has **no expiry/asOf field** and `firmStatus` (audit-decide.ts:2925)
does `held.includes(requiredAttribute)` → "satisfies" → the finding is filtered OUT of `unverifiedGates` → the card-206-A
clamp never fires → committal `eligible=true` with the "⚠ ELIGIBILITY NOT VERIFIED" caution REMOVED. **A stale cert is
strictly worse than a null profile: populating the profile deletes the only safety net.** M2's "not held → INELIGIBLE"
contradicts the shipped open-world default (card-254 B) — not-held is "unknown", and getting INELIGIBLE requires
`closedWorld:true`, whose own comment says the opt-in exists so nothing can "silently arm mass false-INELIGIBLE".
`buildBidderProfileFromCapability` deliberately EXCLUDES size/clearance/OEM/QPL ("a firm cannot self-clear those") —
M2's proposed schema breaks that contract.

**M3:** the "49-record replay corpus" is the LOADABLE count. `ceo/GROUNDFIXTURE-BASELINE.txt`: **14 faithfully
replayable** (41 lack `flagEnv`, excluded), **6 distinct solicitations**, top-2 = 8/14, **BID/NO_BID/INELIGIBLE all
ZERO**, baseline reproduction **4/14 (29%)**, drift 14/14. Conformal needs exchangeability + labeled ground truth;
this set has neither, and n=14 floors miscoverage granularity at 1/(n+1) ≈ 6.7%.

See [[project_groundfixture_state]], [[feedback_no_blocklist_shape_allowlist_doctrine]],
[[feedback_write_the_falsification_probe_first]].
