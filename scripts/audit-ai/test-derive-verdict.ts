// $0 gate for Layer-2 (Brain card 43, build #1). Proves the verdict is now DERIVED deterministically
// from typed grounded findings — including Brain card-42 §4's new criterion: identical input → identical
// verdict across N runs (the old single-shot architecture could NEVER satisfy this).
//   npx tsx scripts/audit-ai/test-derive-verdict.ts
import { deriveVerdict } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

const f = (o: Partial<TypedFinding> & { kind: TypedFinding["kind"]; controllability: TypedFinding["controllability"] }): TypedFinding => ({
  requirement: o.requirement ?? "requirement", citation: "FAR 52.x", excerpt: "verbatim", grounded: true, lens: "x",
  kind: o.kind, controllability: o.controllability, requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow,
});
const inp = (findings: TypedFinding[], o: { profile?: BidderProfile | null; coverage?: boolean; sound?: boolean; conflict?: boolean; manifest?: boolean } = {}): VerdictInputs =>
  ({ findings, bidderProfile: o.profile ?? null, coverageComplete: o.coverage ?? true, verifierSound: o.sound ?? true, conflict: o.conflict ?? false, manifestComplete: o.manifest ?? true });

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

// ── The #2 case: cab/GVWR is commodity sourcing → bidder_controls; DEI is boilerplate; set-aside the firm
//    qualifies for is already_satisfied. Expect BID (what the stochastic panel could not stabilize). ──
const two = [
  f({ requirement: "enclosed cab + GVWR 3500-4500 lb", kind: "technical_spec", controllability: "bidder_controls" }),
  f({ requirement: "submit pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" }),
  f({ requirement: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" }),
  f({ requirement: "Anti-Discrimination / DEI", kind: "boilerplate", controllability: "bidder_controls" }),
  f({ requirement: "100% small-business set-aside (firm qualifies)", kind: "eligibility_bar", controllability: "already_satisfied" }),
];
eq("#2 → BID", deriveVerdict(inp(two)).verdict, "BID");
eq("#2 DEI dropped", deriveVerdict(inp(two)).dispositions.find((d) => d.kind === "boilerplate")?.disposition, "dropped");
eq("#2 set-aside met", deriveVerdict(inp(two)).dispositions.find((d) => d.requirement.includes("set-aside"))?.disposition, "met");

// ── Ladder ──
eq("incomplete coverage → INCOMPLETE", deriveVerdict(inp(two, { coverage: false })).verdict, "INCOMPLETE");
eq("verifier unsound → NEEDS_HUMAN_REVIEW", deriveVerdict(inp(two, { sound: false })).verdict, "NEEDS_HUMAN_REVIEW");
eq("conflict → NEEDS_HUMAN_REVIEW", deriveVerdict(inp(two, { conflict: true })).verdict, "NEEDS_HUMAN_REVIEW");

// ── Brain card-44 §2: curability splits the old blanket "unknown → CAUTION" branch. ──
// 5a. UNTYPED bar (bidder_cannot_move, no requiredAttribute / no curableInWindow) → FAIL CLOSED to human review.
const untyped = [...two, f({ requirement: "proprietary single-source widget", kind: "technical_spec", controllability: "bidder_cannot_move" })];
eq("untyped disqualifying bar → NEEDS_HUMAN_REVIEW (fail closed)", deriveVerdict(inp(untyped)).verdict, "NEEDS_HUMAN_REVIEW");

// 5b. THE MOAT-THREAT INPUT (Brain §2): non-curable structural bar + null profile → NOT a soft caution.
const nonCurable = [...two, f({ requirement: "active facility clearance required at award (lead time > window)", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "clearance:secret-facility", curableInWindow: false })];
eq("non-curable bar, null profile → NEEDS_HUMAN_REVIEW (not CAUTION — the SPRS error stays disarmed)", deriveVerdict(inp(nonCurable)).verdict, "NEEDS_HUMAN_REVIEW");
eq("non-curable bar names the bar in showStoppers", deriveVerdict(inp(nonCurable)).showStoppers.length, 1);

// 5c. CURABLE bar + null profile → genuine residual → BID_WITH_CAUTION.
const curable = [...two, f({ requirement: "obtain SAM registration before award", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "sam:registered", curableInWindow: true })];
eq("curable bar, null profile → BID_WITH_CAUTION", deriveVerdict(inp(curable)).verdict, "BID_WITH_CAUTION");

// Brain card-45 refinement: the non-curable human-review state must CARRY the conditional-NO_BID payload.
eq("non-curable reason carries CONDITIONAL NO-BID payload", /CONDITIONAL NO-BID/.test(deriveVerdict(inp(nonCurable)).reason), true);

// Brain card-45 typing guard: a UNIVERSAL impossibility (no_one_can_move) is a PROVEN show-stopper even under
// a null profile — must hit NO_BID, NOT soften to human-review (the mistype Brain warned about).
const universal = [...two, f({ requirement: "5-day delivery against a 90-day irreducible lead time", kind: "technical_spec", controllability: "no_one_can_move" })];
eq("universal impossibility, null profile → NO_BID (not human-review)", deriveVerdict(inp(universal)).verdict, "NO_BID");
eq("universal impossibility is a named show-stopper", deriveVerdict(inp(universal)).showStoppers.length, 1);
// a universal ELIGIBILITY impossibility → INELIGIBLE
const universalElig = [f({ requirement: "set-aside category no firm can meet", kind: "eligibility_bar", controllability: "no_one_can_move" })];
eq("universal eligibility impossibility → INELIGIBLE", deriveVerdict(inp(universalElig)).verdict, "INELIGIBLE");

// ── Brain card-49 typing doctrine, locked at the decision layer (correct typing → correct verdict). ──
// plain Total SB set-aside = already_satisfied (the pool) → NOT a gate → BID
eq("Total SB set-aside (already_satisfied) → BID, never a bar", deriveVerdict(inp([f({ requirement: "Total Small Business Set-Aside 52.219-6", kind: "eligibility_bar", controllability: "already_satisfied" })])).verdict, "BID");
// narrower socioeconomic set-aside = bidder_cannot_move + curable (verify status), null profile → CAUTION (never disqualifier)
eq("socioeconomic set-aside (curable, verify status) → BID_WITH_CAUTION", deriveVerdict(inp([f({ requirement: "SDVOSB set-aside", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "setaside:sdvosb", curableInWindow: true })])).verdict, "BID_WITH_CAUTION");
// standard self-cert rep = bidder_controls → gate to clear → BID
eq("self-cert rep (bidder_controls) → BID", deriveVerdict(inp([f({ requirement: "telecom security rep 52.240-91", kind: "clause_flowdown", controllability: "bidder_controls" })])).verdict, "BID");

// ── Brain card-51 pre-#3 guard: CLOSED-world (known-fail) vs OPEN-world (unknown) on the SAME structural bar.
// The Dillon sole-source bar must yield INELIGIBLE only via firmStatus="fails" on a KNOWN-absent attribute
// (non-null empty profile = "this generic SB is known not to be the named OEM"), NOT from a null/unknown
// profile (that's the open-world branch → NEEDS_HUMAN_REVIEW, never eligible:false). Right label, right reason.
const dillon = (profile: BidderProfile | null) => deriveVerdict(inp([f({ requirement: "sole-source to named OEM (Dillon Aero DGMT1002)", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "oem:dillon-approved-source", curableInWindow: false })], { profile }));
eq("closed-world (known-empty profile) → INELIGIBLE via firmStatus=fails", dillon({ satisfiedAttributes: [] }).verdict, "INELIGIBLE");
eq("closed-world INELIGIBLE is eligible:false", dillon({ satisfiedAttributes: [] }).eligible, false);
eq("open-world (null profile) → NEEDS_HUMAN_REVIEW, NOT eligible:false (no Norfolk over-fire)", dillon(null).verdict, "NEEDS_HUMAN_REVIEW");
eq("open-world (null profile) stays eligible:true", dillon(null).eligible, true);
eq("firm PROVABLY holds the OEM attribute → BID (cleared)", dillon({ satisfiedAttributes: ["oem:dillon-approved-source"] }).verdict, "BID");

// eligibility bar the firm provably FAILS (profile lacks the required NAICS) → INELIGIBLE
const eligBar = [f({ requirement: "must be small under NAICS 333120", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "naics:333120-small" })];
eq("eligibility bar firm fails → INELIGIBLE", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] } })).verdict, "INELIGIBLE");
eq("same bar, firm qualifies → BID", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: ["naics:333120-small"] } })).verdict, "BID");
// non-eligibility uncontrollable bar the firm provably fails → NO_BID
const noBid = [f({ requirement: "must hold exclusive OEM license", kind: "clause_flowdown", controllability: "bidder_cannot_move", requiredAttribute: "oem:exclusive" })];
eq("uncontrollable non-elig bar firm fails → NO_BID", deriveVerdict(inp(noBid, { profile: { satisfiedAttributes: [] } })).verdict, "NO_BID");

// ── Brain card-58 ASYMMETRY CAP: an unfetched manifest attachment caps no-bar verdicts, NOT bar-found. ──
eq("BID + manifest incomplete → INCOMPLETE (cap)", deriveVerdict(inp(two, { manifest: false })).verdict, "INCOMPLETE");
eq("CAUTION + manifest incomplete → INCOMPLETE (cap)", deriveVerdict(inp(curable, { manifest: false })).verdict, "INCOMPLETE");
eq("INELIGIBLE + manifest incomplete → STILL INELIGIBLE (asymmetry)", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] }, manifest: false })).verdict, "INELIGIBLE");
eq("NO_BID + manifest incomplete → STILL NO_BID (asymmetry)", deriveVerdict(inp(noBid, { profile: { satisfiedAttributes: [] }, manifest: false })).verdict, "NO_BID");

// ── DETERMINISM (Brain card-42 §4): identical input → identical verdict across 50 runs. ──
const baseline = JSON.stringify(deriveVerdict(inp(two)));
let drift = 0;
for (let i = 0; i < 50; i++) if (JSON.stringify(deriveVerdict(inp(two))) !== baseline) drift++;
eq("determinism: 0 drift across 50 runs", drift, 0);

console.log(`derive-verdict gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — verdict DERIVED in code (the #2 case = BID); full ladder; 0 drift across 50 runs (determinism proven).");
