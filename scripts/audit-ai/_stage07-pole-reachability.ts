// $0 READ-ONLY PROBE — can the DECLINE poles fire in production? 2026-08-06.
// Drives the REAL exported deriveVerdict/firmStatus/buildBidderProfileFromCapability. No model call, no write.
import { deriveVerdict, firmStatus, isVerifiedUniversalDefect, excerptHash } from "../../src/lib/audit-decide";
// CORRECT module + CORRECT id. An earlier version of this probe imported registerJudgmentVerifier from
// audit-decide (it lives in audit-judgment-layer) and swallowed the TypeError in a try/catch — the verifier
// was never registered and NO_BID was "unreachable" for the WRONG reason. That is the false-trace class the
// 08-05 banked audit hit. No try/catch here: registration must fail LOUD if it fails.
import { registerJudgmentVerifier, JUDGMENT_VERIFIER_ID } from "../../src/lib/audit-judgment-layer";
import { buildBidderProfileFromCapability } from "../../src/lib/audit-bidder-profile";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";

registerJudgmentVerifier();  // exactly as module-load does on the worker

const SRC = "The offeror shall hold a Secret facility clearance. clearance:secret-facility is required. "
  + "The 5-day delivery and the 90-day first article test are both mandatory.";
const base = {
  bidderProfile: null as BidderProfile | null, coverageComplete: true, verifierSound: true, conflict: false,
  documentsComplete: true, manifestComplete: true, source: SRC,
};
// use the ENGINE'S OWN excerptHash — a locally re-implemented (normalizing) twin silently mismatched.

console.log("=== 1. What profile does PRODUCTION actually build? ===");
for (const cap of [
  { certifications: ["SDVOSB", "8(a)", "HUBZone", "WOSB", "Small Business"] },
  { certifications: ["Top Secret Facility Clearance", "CMMC Level 2", "AS9100"] },
  { certifications: [] },
]) {
  const p = buildBidderProfileFromCapability(cap as never);
  console.log(`  in=${JSON.stringify(cap.certifications).slice(0, 52).padEnd(54)} → closedWorld=${p?.closedWorld} openWorld=${p?.openWorld} attrs=${JSON.stringify(p?.satisfiedAttributes ?? null)}`);
}

console.log("\n=== 2. Can firmStatus EVER return 'fails' on a production-built profile? ===");
const gate: TypedFinding = {
  requirement: "Offeror must hold a Secret facility clearance", citation: "§L", excerpt: SRC,
  kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false,
  requiredAttribute: "clearance:secret-facility", grounded: true, lens: "probe", severity: "P0",
};
const prodProfile = buildBidderProfileFromCapability({ certifications: ["SDVOSB"] } as never);
console.log(`  production-built profile      → firmStatus=${firmStatus(gate, prodProfile, SRC)}`);
console.log(`  hand-made closedWorld profile → firmStatus=${firmStatus(gate, { satisfiedAttributes: [], closedWorld: true } as BidderProfile, SRC)}`);

console.log("\n=== 3. INELIGIBLE reachability ===");
const inel = (p: BidderProfile | null, label: string) =>
  console.log(`  ${label.padEnd(46)} → ${deriveVerdict({ ...base, findings: [gate], bidderProfile: p }).verdict}`);
inel(prodProfile, "profile from buildBidderProfileFromCapability");
inel(null, "null profile (no capability statement)");
inel({ satisfiedAttributes: [], openWorld: true } as BidderProfile, "explicit open-world, empty");
inel({ satisfiedAttributes: [], closedWorld: true } as BidderProfile, "hand-made closedWorld (NOT production)");

console.log("\n=== 4. NO_BID reachability — a VERIFIED universal defect ===");
const DEFECT_EXCERPT = "The 5-day delivery and the 90-day first article test are both mandatory.";
const defect: TypedFinding = {
  requirement: "Contradictory mandatory terms — no offeror can comply", citation: "§C", excerpt: DEFECT_EXCERPT,
  kind: "technical_spec", controllability: "no_one_can_move", curableInWindow: false, grounded: true,
  lens: "judgment_producer", severity: "P0",
  universalDefect: "contradictory_mandatory_terms",
  verifiedBy: { verifierId: JUDGMENT_VERIFIER_ID, excerptHash: excerptHash(DEFECT_EXCERPT), affirmation: "the contradiction follows from the cited excerpt" },
} as TypedFinding;
console.log(`  verifierId used = ${JUDGMENT_VERIFIER_ID}`);
console.log(`  isVerifiedUniversalDefect(defect) = ${isVerifiedUniversalDefect(defect)}  <-- MUST be true or the trace is false`);
const nb = (label: string) => console.log(`  ${label.padEnd(46)} → ${deriveVerdict({ ...base, findings: [defect] }).verdict}`);
delete process.env.AUDIT_FOURWALLS_NOBID;
nb("AUDIT_FOURWALLS_NOBID unset (PRODUCTION)");
process.env.AUDIT_FOURWALLS_NOBID = "true";
nb("AUDIT_FOURWALLS_NOBID=true (NOT production)");
delete process.env.AUDIT_FOURWALLS_NOBID;

console.log("\n=== 5. Does any producer emit universalDefect on the live path? ===");
console.log("  (grep result reported in the write-up — audit-judgment-layer.ts is the sole producer)");
