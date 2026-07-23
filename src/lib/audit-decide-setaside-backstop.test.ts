// INTEGRATION — the set-aside backstop through the real deriveVerdict (flag AUDIT_SETASIDE_BACKSTOP).
// Proves: flag-OFF byte-identical; flag-ON caps a would-be committal BID → BWC on an unaccounted-for set-aside
// pool; a HANDLED pool is not double-capped; the backstop NEVER upgrades or overrides a non-committal return;
// and — post-#677 — a clearance/vehicle/CMMC prose bar in source changes NOTHING in either flag state, because
// part A is deleted (ceo/GRAVEYARD-HARDBAR-PART-A.md).
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { deriveVerdict } from "./audit-decide";
import type { VerdictInputs, TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_SETASIDE_BACKSTOP;
  process.env.AUDIT_SETASIDE_BACKSTOP = on ? "true" : "false";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_SETASIDE_BACKSTOP; else process.env.AUDIT_SETASIDE_BACKSTOP = prev; }
};
const f = (over: Partial<TypedFinding>): TypedFinding => ({
  requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, lens: "test", ...over,
});
// a clean, biddable package: one bidder_controls gate-to-clear finding (so it survives the empty-set guard and
// reaches step 6 BID), coverage/verifier complete, no bars.
const base = (source: string): VerdictInputs => ({
  findings: [f({ requirement: "Price all CLINs per the schedule.", excerpt: "Price all CLINs.", citation: "B.1", controllability: "bidder_controls", curableInWindow: true })],
  bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source,
});

const CLEAN = "This is a full and open solicitation. Award will be made to the lowest-priced technically acceptable offeror. Price all CLINs.";
const CLEARANCE = CLEAN + " Award is restricted to firms possessing a TOP SECRET facility clearance at the time of proposal submission.";
const SETASIDE = "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020) Yes\n" + CLEAN; // clause-matrix row detectSetAsideNotices keys on

// ── 1. flag-OFF byte-identical ──────────────────────────────────────────────────────────────────────────────
{ const off = withFlag(false, () => deriveVerdict(base(SETASIDE)));
  assert(off.verdict === "BID", `flag-OFF: set-aside-in-source clean package → BID unchanged (got ${off.verdict})`); }
{ const off = withFlag(false, () => deriveVerdict(base(CLEAN)));
  assert(off.verdict === "BID", `flag-OFF: clean package → BID (got ${off.verdict})`); }

// ── 2. flag-ON caps the committal — at BWC, never NHR ───────────────────────────────────────────────────────
{ const on = withFlag(true, () => deriveVerdict(base(SETASIDE)));
  assert(on.verdict === "BID_WITH_CAUTION", `flag-ON: unaccounted-for set-aside → BID capped to BWC (got ${on.verdict})`);
  assert(on.eligible === null, "flag-ON: set-aside BWC cap sets eligible=null (not determined)");
  assert(/set-aside/i.test(on.reason), "flag-ON: BWC reason names the set-aside pool"); }
{ const on = withFlag(true, () => deriveVerdict(base(CLEAN)));
  assert(on.verdict === "BID", `flag-ON: genuinely clean package → still BID (no over-fire) (got ${on.verdict})`); }

// ── 3. PART A IS RETIRED — a clearance prose bar is inert in BOTH flag states (card #677) ───────────────────
// Before #677 this exact input capped BID → NHR. The prose floor is deleted, so the verdict is now whatever the
// ordinary ladder says, identically with the flag on and off. The residual exposure is named and owned by the
// veto / v2 obligation ledger / panel lenses / #575 — NOT by this unit.
{ const on = withFlag(true, () => deriveVerdict(base(CLEARANCE)));
  const off = withFlag(false, () => deriveVerdict(base(CLEARANCE)));
  assert(on.verdict === off.verdict && on.reason === off.reason,
    `retired part A: clearance prose bar → flag-ON == flag-OFF (on=${on.verdict} off=${off.verdict})`);
  assert(on.verdict === "BID", `retired part A: no NHR cap remains from a prose possession frame (got ${on.verdict})`); }

// ── 4. flag-ON but the pool is already HANDLED → the existing ladder decides; no double-cap ─────────────────
{ const inp = base(SETASIDE);
  inp.findings = [...inp.findings, f({ requirement: "Total small business set-aside — firm qualifies", excerpt: "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020)", citation: "52.219-6", controllability: "already_satisfied", requiredAttribute: "sb:total" })];
  const on = withFlag(true, () => deriveVerdict(inp));
  const off = withFlag(false, () => deriveVerdict(inp));
  assert(on.verdict === off.verdict, `handled set-aside pool → flag-ON == flag-OFF (on=${on.verdict} off=${off.verdict})`); }

// ── 5. the backstop NEVER overrides a non-committal — an INCOMPLETE package stays INCOMPLETE ────────────────
{ const inp = base(SETASIDE); inp.documentsComplete = false;
  const on = withFlag(true, () => deriveVerdict(inp));
  assert(on.verdict === "INCOMPLETE", `flag-ON: documentsComplete=false → INCOMPLETE (never upgrades a non-committal) (got ${on.verdict})`); }

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS");
if (failures) process.exit(1);
