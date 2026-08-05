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
import { buildManifest, completenessOf, locateObligationContext } from "@/lib/audit-orchestrator";
import { gradeCoverageV2, verifyRecitalInSource, consequenceTailsAfter } from "@/lib/audit-gate-v2";
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
// FORK-7 MIGRATION LEDGER (Brain card 240 item 5): the U5 XFAILs (a pre-Fork-1/Fork-2 NO_BID pole) migrated to
// live assertions at their empirically-confirmed current verdict. Zero XFAIL remaining. Printed as a table below.
const mig: Array<{ assert: string; from: string; to: string; elig: string }> = [];
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE;
  if (on) process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; else delete process.env.AUDIT_ELIGIBLE_TRISTATE;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev; }
};

const wosb = (): TypedFinding => ({ id: "wosb", requirement: "WOSB set-aside: 100% Women-Owned Small Business (WOSB) set-aside", citation: "§A", excerpt: "100% women-owned small business set-aside (WOSB)", kind: "eligibility_bar", controllability: "already_satisfied", requiredAttribute: "setaside:WOSB", curableInWindow: true, grounded: true, lens: "capture" });
const inputs = (findings: TypedFinding[], profile: BidderProfile | null, coverageComplete: boolean): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete, verifierSound: true, conflict: false, manifestComplete: true });
// RE-BASELINED 2026-08-04 — "verified" now means an AUTHORITATIVE RECORD, not a token in an array. Under U-C
// (panel 2026-07-29 M2, flag AUDIT_PROFILE_SCHEMA_V2, live-armed) `setaside:` is an authoritative-only namespace:
// a bare satisfiedAttributes entry is a customer ASSERTION and cannot satisfy a set-aside bar — that was the whole
// point of the ruling (it closed a red-teamed false-BID vector where an asserted string cleared FCL/QPL/size
// bars). The old fixture was the pre-U-C shape, so U4 was measuring "does an unverified claim clear a bar", and
// the answer is correctly no. Both shapes are now kept and asserted AGAINST each other.
const verifiedWOSB: BidderProfile = {
  satisfiedAttributes: ["setaside:WOSB"], openWorld: false, asOf: "2026-08-04T00:00:00Z",
  attributes: [{ attr: "setaside:WOSB", source: "sba_api", verifiedAt: "2026-06-01T00:00:00Z" }],
} as unknown as BidderProfile;
const selfAssertedWOSB: BidderProfile = { satisfiedAttributes: ["setaside:WOSB"], openWorld: false } as BidderProfile;

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
// U4b — THE U-C CONTRAST (added with the fixture re-baseline): the SAME claim with no authoritative record behind
// it is a customer assertion, and a customer assertion may not clear a set-aside bar. Capped + named, never a
// silent BID. This is the false-BID vector the panel closed; if it ever goes green as BID/eligible=true, U-C has
// regressed.
withFlag(true, () => { const d = decide([wosb()], selfAssertedWOSB, true);
  eq("U4b self-asserted WOSB does NOT clear the bar (eligible not determined)", d.eligible, null);
  ok("U4b and the reason says the profile does not establish it", /ELIGIBILITY NOT VERIFIED/.test(d.reason) && /WOSB/i.test(d.reason)); });
// U5 — FORK-7 MIGRATION (card 240 item 5, was XFAIL): an unmarked no_one_can_move temporal bar under a null
// profile is NEEDS_HUMAN_REVIEW (Fork-1 temporal = CAUTION-only; Fork-2 default-deny made NO_BID unreachable
// without a positive universalDefect mark). Empirically confirmed live before writing (card-236 discipline).
const barFinding = (): TypedFinding => ({ id: "bar", requirement: "Delivery in 5 days vs 90-day lead time", citation: "§F", excerpt: "deliver within 5 days", kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "capture" });
withFlag(false, () => { const d = decide([barFinding()], null, true);
  mig.push({ assert: "U5 OFF: temporal no_one_can_move + null", from: "NO_BID", to: d.verdict, elig: String(d.eligible) });
  eq("U5 OFF: temporal bar + null → NHR (was NO_BID)", d.verdict, "NEEDS_HUMAN_REVIEW"); eq("U5 OFF eligible=true (NHR, flag-off)", d.eligible, true); });
withFlag(true, () => { const d = decide([barFinding()], null, true);
  mig.push({ assert: "U5 ON (tristate): temporal no_one_can_move + null", from: "NO_BID/eligible:true", to: `${d.verdict}/eligible:${d.eligible}`, elig: String(d.eligible) });
  eq("U5 ON: temporal bar + null → NHR (was NO_BID)", d.verdict, "NEEDS_HUMAN_REVIEW"); eq("U5 ON eligible=null (tristate NHR; item-h residue resolved by tristate)", d.eligible, null); });
// U5b — attribute-less eligibility_bar must NOT force eligible=null under a verified/any profile (code-review #3/#4).
//
// ⚠ DELIBERATELY LEFT RED 2026-08-04 — THIS ONE IS A RULING, NOT A RE-BASELINE. Measured today: an eligibility_bar
// carrying NO requiredAttribute resolves eligible=null under EVERY profile — null, self-asserted, AND an
// authoritative U-C profile. Two readings are defensible and the engine cannot pick between them:
//   (a) STALE — an untyped bar is a bar the engine could not match against any profile, so "not determined" plus a
//       named caution is the honest answer, and Rule 70 says cap-and-name rather than mute. On this reading the
//       guard below is pre-Rule-70 and should be retired.
//   (b) LIVE DEFECT — this is precisely the over-fire the code-review #3/#4 guard was written to stop: a firm with
//       a fully verified profile loses eligible=true because of a bar the engine failed to TYPE. On this reading
//       the engine is charging the customer for its own extraction gap.
// Tuning this green either way would encode an answer nobody ruled. It stays red and visible until it is ruled.
const samNote = (): TypedFinding => ({ id: "sam", requirement: "Offeror must be registered in SAM", citation: "§K", excerpt: "registered in SAM", kind: "eligibility_bar", controllability: "bidder_controls", grounded: true, lens: "capture" });
withFlag(true, () => { const d = decide([samNote()], null, true); eq("U5b ON attribute-less eligibility item → eligible=true (no over-fire) [RULING OWED]", d.eligible, true); });
// U6 — flag-OFF BYTE-IDENTITY: reason strings unchanged (no caution injected).
withFlag(false, () => eq("U6 OFF BID reason unchanged", decide([wosb()], null, true).reason, "Open, eligible; all unmet items are bidder-controllable gates to clear (the work of bidding)."));

// ── REPLAY (persisted card-202 record) ──────────────────────────────────────────
// card-202 authoring fixture (PRE-tristate): its §L/§M are NOT pre-grounded, so the INCOMPLETE/ungrounded B-leg
// cases stay meaningful. The card-210 record (captured with AUDIT_ELIGIBLE_TRISTATE=true) has §L/§M pre-grounded;
// a bare `.sort().pop()` would grab it and mask B2/INCOMPLETE. Pin by captured-flag to the pre-tristate record.
const rf = readdirSync("scripts/audit-ai/run-records")
  .filter((x) => x.includes("SP3300") && x.endsWith(".json"))
  .filter((x) => JSON.parse(readFileSync("scripts/audit-ai/run-records/" + x, "utf8")).meta?.flags?.AUDIT_ELIGIBLE_TRISTATE !== "true")
  .sort().pop();
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

  // RE-BASELINED 2026-08-04 — the B-block decided through `decide()`, which builds VerdictInputs WITHOUT
  // coverageV2 and therefore reaches the legacy "!coverageComplete ⇒ INCOMPLETE" line (audit-decide.ts:3614) that
  // PRODUCTION NEVER REACHES (the orchestrator always supplies coverageV2 under AUDIT_GATE_V2, which is live).
  // B1/B3 failed against that dead path; B2 PASSED because of it, which is worse — a green assertion pinning a
  // line the engine cannot execute. All three now decide through the production shape. Coverage does not complete
  // on this record (§B/§C/§M refused by later floors, §C by the live-armed covered_direct hard-bar floor), and
  // under Rule 70 it no longer needs to: the committal is CAPPED with the item NAMED instead of muted.
  const decideV2 = (fs: TypedFinding[], profile: BidderProfile | null) => {
    const { missing, attestations } = completenessOf(ctx, required, fs, sr) as unknown as { missing: string[]; attestations: unknown[] };
    return deriveVerdict({
      findings: orch(fs, profile), bidderProfile: profile, coverageComplete: missing.length === 0 && required.length > 0,
      verifierSound: true, conflict: false, manifestComplete: true, source: ctx.fullSource,
      coverageV2: gradeCoverageV2(attestations as never, {
        locate: (o: string) => locateObligationContext(ctx.fullSource, o),
        verifyRecitalPresence: (o: string) => verifyRecitalInSource(ctx.fullSource, o),
        consequenceTails: (o: string) => consequenceTailsAfter(ctx.fullSource, o),
      }),
    } as VerdictInputs);
  };
  // B1 — flag ON + procedural → the ruled target end-state (full path: orchestrator firm-status typing + deriveVerdict).
  withFlag(true, () => {
    const fs = [...recFindings(), ...proc];
    const d = decideV2(fs, null);
    eq("B1 verdict=BID_WITH_CAUTION (capped, not muted)", d.verdict, "BID_WITH_CAUTION");
    eq("B1 eligible=null", d.eligible, null);
    ok("B1 the uncovered item is NAMED, not buried in a manifest complaint", /CAUTION/.test(d.reason) && /§[A-M]/.test(d.reason));
    ok("B1 WOSB gate_to_clear typing", d.dispositions.some((f) => f.requiredAttribute === "setaside:WOSB" && f.disposition === "gate_to_clear"));
    ok("B1 mandatory WOSB verify-caution", /ELIGIBILITY NOT VERIFIED/.test(d.reason) && /WOSB/i.test(d.reason));
  });
  // B2 — flag ON, no procedural. Was "INCOMPLETE eligible=null"; that INCOMPLETE came from the dead legacy line.
  withFlag(true, () => { const d = decideV2(recFindings(), null); eq("B2 verdict=BID_WITH_CAUTION (was INCOMPLETE via the legacy line)", d.verdict, "BID_WITH_CAUTION"); eq("B2 eligible=null", d.eligible, null); });
  // B3 — flag OFF + procedural → the pre-tristate pole: a committal that still resolves eligibility to true.
  withFlag(false, () => { const d = decideV2([...recFindings(), ...proc], null); eq("B3 OFF verdict=BID_WITH_CAUTION", d.verdict, "BID_WITH_CAUTION"); eq("B3 OFF eligible=true (tristate is what nulls it)", d.eligible, true); });
}

console.log("\n── FORK-7 XFAIL→live migration (U5, empirically confirmed) ──");
mig.forEach((m, i) => console.log(`  ${i + 1}  ${m.assert.padEnd(48)}  ${(`${m.from} → ${m.to}`).padEnd(34)}  eligible=${m.elig}`));
console.log(`  (${mig.length} migrated · 0 XFAIL remaining)`);
console.log(`\neligible-tristate gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log(`✅ ALL PASS (· ${mig.length} XFAIL→live migrated, 0 remaining) — null-profile eligibility guarantee: tristate + mandatory firm-status typing + verify-caution; verified path intact; flag-OFF byte-identical.`);
process.exit(0);
