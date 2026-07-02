// $0 gate for Brain card 206-A — NULL-PROFILE ELIGIBILITY GUARANTEE (single flag AUDIT_ELIGIBLE_TRISTATE).
//   npx tsx scripts/audit-ai/test-eligible-tristate.ts
//
// Proves the ONE guarantee (three behaviors, one flag) + flag-OFF byte-identity:
//   (a) null-profile already_satisfied set-aside → gate_to_clear/bidder_controls (mandatory firm-status typing);
//   (b) eligible tristate — null on honest-fail OR on a committal verdict with an unverified eligibility gate;
//       eligible=true ONLY when every eligibility gate is verified-cleared; eligible=false unchanged;
//   (c) an unverified eligibility gate on a committal verdict surfaces as a mandatory verify-caution in the reason.
// Replay leg uses the persisted card-202 record + injected procedural findings (plumbing fixture, NOT a gate anchor).

import { readFileSync, readdirSync } from "fs";
import { deriveVerdict, applySetAsideFirmStatusGate } from "@/lib/audit-decide";
import { buildManifest, completenessOf } from "@/lib/audit-orchestrator";
import { readSection, type AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

// Mirror the orchestrator: behavior (a) firm-status typing runs in the guard chain (enabled by the flag) BEFORE
// deriveVerdict, so the test exercises the same finding set the engine decides + persists.
const orch = (findings: TypedFinding[], profile: BidderProfile | null): TypedFinding[] =>
  applySetAsideFirmStatusGate(findings, profile, { enabled: process.env.AUDIT_ELIGIBLE_TRISTATE === "true" || process.env.AUDIT_SETASIDE_FIRMSTATUS_GATE === "true" });
const decide = (findings: TypedFinding[], profile: BidderProfile | null, coverageComplete: boolean) =>
  deriveVerdict({ findings: orch(findings, profile), bidderProfile: profile, coverageComplete, verifierSound: true, conflict: false, manifestComplete: true });

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };
const ok = (label: string, cond: boolean) => { if (cond) pass++; else fails.push(label); };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE;
  if (on) process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; else delete process.env.AUDIT_ELIGIBLE_TRISTATE;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev; }
};

const wosb = (): TypedFinding => ({ id: "wosb", requirement: "WOSB set-aside: 100% Women-Owned Small Business (WOSB) set-aside", citation: "§A", excerpt: "100% women-owned small business set-aside (WOSB)", kind: "eligibility_bar", controllability: "already_satisfied", requiredAttribute: "setaside:WOSB", curableInWindow: true, grounded: true, lens: "capture" });
const inputs = (findings: TypedFinding[], profile: BidderProfile | null, coverageComplete: boolean): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete, verifierSound: true, conflict: false, manifestComplete: true });
const verifiedWOSB: BidderProfile = { satisfiedAttributes: ["setaside:WOSB"], openWorld: false } as BidderProfile;

// ── UNIT ──────────────────────────────────────────────────────────────────────
// U1 — committal + null-profile already_satisfied WOSB (full path: orchestrator firm-status typing + deriveVerdict).
withFlag(false, () => { const d = decide([wosb()], null, true); eq("U1 OFF verdict=BID", d.verdict, "BID"); eq("U1 OFF eligible=true", d.eligible, true); });
withFlag(true, () => {
  const d = decide([wosb()], null, true);
  eq("U1 ON verdict=BID_WITH_CAUTION (a: re-typed to a caution)", d.verdict, "BID_WITH_CAUTION");
  eq("U1 ON eligible=null (b)", d.eligible, null);
  ok("U1 ON gate_to_clear typing (a)", d.dispositions.some((f) => f.requiredAttribute === "setaside:WOSB" && f.disposition === "gate_to_clear" && f.controllability === "bidder_controls"));
  ok("U1 ON mandatory verify-caution (c)", /ELIGIBILITY NOT VERIFIED/.test(d.reason) && /WOSB/i.test(d.reason));
});
// U2 — honest-fail INCOMPLETE.
withFlag(false, () => eq("U2 OFF INCOMPLETE eligible=false", decide([wosb()], null, false).eligible, false));
withFlag(true, () => { const d = decide([wosb()], null, false); eq("U2 ON INCOMPLETE verdict", d.verdict, "INCOMPLETE"); eq("U2 ON INCOMPLETE eligible=null", d.eligible, null); });
// U3 — NHR (conflict) honest-fail.
const conflictIn = (): VerdictInputs => ({ findings: orch([wosb()], null), bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: true, manifestComplete: true });
withFlag(false, () => { const d = deriveVerdict(conflictIn()); eq("U3 OFF NHR eligible=true (unchanged)", d.eligible, true); });
withFlag(true, () => { const d = deriveVerdict(conflictIn()); eq("U3 ON NHR verdict", d.verdict, "NEEDS_HUMAN_REVIEW"); eq("U3 ON NHR eligible=null", d.eligible, null); });
// U4 — VERIFIED profile satisfies WOSB → eligible=true path intact under BOTH flags (verified vouch untouched).
withFlag(true, () => { const d = decide([wosb()], verifiedWOSB, true); eq("U4 ON verified verdict=BID", d.verdict, "BID"); eq("U4 ON verified eligible=true", d.eligible, true); });
withFlag(false, () => eq("U4 OFF verified eligible=true", decide([wosb()], verifiedWOSB, true).eligible, true));
// U5 — a REAL universal bar (no_one_can_move) → NO_BID, eligible=true (not eligibility_bar) — unchanged both flags.
const barFinding = (): TypedFinding => ({ id: "bar", requirement: "Delivery in 5 days vs 90-day lead time", citation: "§F", excerpt: "deliver within 5 days", kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "capture" });
withFlag(false, () => { const d = decide([barFinding()], null, true); eq("U5 OFF NO_BID", d.verdict, "NO_BID"); eq("U5 OFF eligible=true", d.eligible, true); });
withFlag(true, () => { const d = decide([barFinding()], null, true); eq("U5 ON NO_BID unchanged", d.verdict, "NO_BID"); eq("U5 ON eligible=true unchanged", d.eligible, true); });
// U5b — attribute-less eligibility_bar must NOT force eligible=null under a verified/any profile (code-review #3/#4).
const samNote = (): TypedFinding => ({ id: "sam", requirement: "Offeror must be registered in SAM", citation: "§K", excerpt: "registered in SAM", kind: "eligibility_bar", controllability: "bidder_controls", grounded: true, lens: "capture" });
withFlag(true, () => { const d = decide([samNote()], null, true); eq("U5b ON attribute-less eligibility item → eligible=true (no over-fire)", d.eligible, true); });
// U6 — flag-OFF BYTE-IDENTITY: reason strings unchanged (no caution injected).
withFlag(false, () => eq("U6 OFF BID reason unchanged", decide([wosb()], null, true).reason, "Open, eligible; all unmet items are bidder-controllable gates to clear (the work of bidding)."));

// ── REPLAY (persisted card-202 record) ──────────────────────────────────────────
const rf = readdirSync("scripts/audit-ai/run-records").filter((x) => x.includes("SP3300") && x.endsWith(".json")).sort().pop();
if (!rf) { console.log("⚠ no SP3300 run record — skipping replay leg (run paid-run.ts first). Unit legs still gate."); }
else {
  const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/" + rf, "utf8"));
  const ctx: AuditToolContext = { fullSource: rec.input.fullSource };
  const OB = /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i;
  const proc: TypedFinding[] = [];
  for (const sec of ["L", "M"]) readSection(ctx, sec).text.split(/(?<=[.;\n])/).map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 4 && OB.test(s)).slice(0, 40)
    .forEach((s, i) => proc.push({ id: `proc#${sec}${i}`, requirement: `Procedural (§${sec})`, citation: `§${sec}`, excerpt: s, kind: "submission", controllability: "bidder_controls", grounded: true, lens: "procedural_coverage" }));
  const required = buildManifest(ctx);
  const sr = new Set<string>(rec.result.sectionsRead);
  const recFindings = (): TypedFinding[] => rec.result.findings.map((f: any) => ({ ...f }));
  const covComplete = (fs: TypedFinding[]) => { const { missing } = completenessOf(ctx, required, fs, sr); return missing.length === 0 && required.length > 0; };

  // B1 — flag ON + procedural → the ruled target end-state (full path: orchestrator firm-status typing + deriveVerdict).
  withFlag(true, () => {
    const fs = [...recFindings(), ...proc];
    const d = decide(fs, null, covComplete(fs));
    eq("B1 coverage completes (missing=[])", covComplete(fs), true);
    eq("B1 verdict=BID_WITH_CAUTION", d.verdict, "BID_WITH_CAUTION");
    eq("B1 eligible=null", d.eligible, null);
    ok("B1 WOSB gate_to_clear typing", d.dispositions.some((f) => f.requiredAttribute === "setaside:WOSB" && f.disposition === "gate_to_clear"));
    ok("B1 mandatory WOSB verify-caution", /ELIGIBILITY NOT VERIFIED/.test(d.reason) && /WOSB/i.test(d.reason));
  });
  // B2 — flag ON, no procedural → INCOMPLETE eligible=null (was false).
  withFlag(true, () => { const fs = recFindings(); const d = decide(fs, null, covComplete(fs)); eq("B2 verdict=INCOMPLETE", d.verdict, "INCOMPLETE"); eq("B2 eligible=null (was false)", d.eligible, null); });
  // B3 — flag OFF + procedural → BID_WITH_CAUTION eligible=true (byte-identical to pre-card behavior).
  withFlag(false, () => { const fs = [...recFindings(), ...proc]; const d = decide(fs, null, covComplete(fs)); eq("B3 OFF verdict=BID_WITH_CAUTION", d.verdict, "BID_WITH_CAUTION"); eq("B3 OFF eligible=true", d.eligible, true); });
}

console.log(`eligible-tristate gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — null-profile eligibility guarantee: tristate + mandatory firm-status typing + verify-caution; verified path intact; flag-OFF byte-identical.");
process.exit(0);
