// $0 gate for Layer-2 (Brain card 43, build #1). Proves the verdict is now DERIVED deterministically
// from typed grounded findings — including Brain card-42 §4's new criterion: identical input → identical
// verdict across N runs (the old single-shot architecture could NEVER satisfy this).
//   npx tsx scripts/audit-ai/test-derive-verdict.ts
import { deriveVerdict } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

const f = (o: Partial<TypedFinding> & { kind: TypedFinding["kind"]; controllability: TypedFinding["controllability"] }): TypedFinding => ({
  requirement: o.requirement ?? "requirement", citation: "FAR 52.x", excerpt: "verbatim", grounded: true, lens: "x",
  kind: o.kind, controllability: o.controllability, requiredAttribute: o.requiredAttribute,
});
const inp = (findings: TypedFinding[], o: { profile?: BidderProfile | null; coverage?: boolean; sound?: boolean; conflict?: boolean } = {}): VerdictInputs =>
  ({ findings, bidderProfile: o.profile ?? null, coverageComplete: o.coverage ?? true, verifierSound: o.sound ?? true, conflict: o.conflict ?? false });

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

// uncontrollable bar, null profile → can't prove failure → residual caution
const cautionFindings = [...two, f({ requirement: "proprietary single-source widget", kind: "technical_spec", controllability: "bidder_cannot_move" })];
eq("uncontrollable bar, null profile → BID_WITH_CAUTION", deriveVerdict(inp(cautionFindings)).verdict, "BID_WITH_CAUTION");

// eligibility bar the firm provably FAILS (profile lacks the required NAICS) → INELIGIBLE
const eligBar = [f({ requirement: "must be small under NAICS 333120", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "naics:333120-small" })];
eq("eligibility bar firm fails → INELIGIBLE", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] } })).verdict, "INELIGIBLE");
eq("same bar, firm qualifies → BID", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: ["naics:333120-small"] } })).verdict, "BID");
// non-eligibility uncontrollable bar the firm provably fails → NO_BID
const noBid = [f({ requirement: "must hold exclusive OEM license", kind: "clause_flowdown", controllability: "bidder_cannot_move", requiredAttribute: "oem:exclusive" })];
eq("uncontrollable non-elig bar firm fails → NO_BID", deriveVerdict(inp(noBid, { profile: { satisfiedAttributes: [] } })).verdict, "NO_BID");

// ── DETERMINISM (Brain card-42 §4): identical input → identical verdict across 50 runs. ──
const baseline = JSON.stringify(deriveVerdict(inp(two)));
let drift = 0;
for (let i = 0; i < 50; i++) if (JSON.stringify(deriveVerdict(inp(two))) !== baseline) drift++;
eq("determinism: 0 drift across 50 runs", drift, 0);

console.log(`derive-verdict gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — verdict DERIVED in code (the #2 case = BID); full ladder; 0 drift across 50 runs (determinism proven).");
