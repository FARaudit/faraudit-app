/**
 * Anti-regressions for Brain card-254 B ruling — FAIL-SAFE WORLD-ASSUMPTION DEFAULT FLIP.
 * (1) DEFAULT profile (no world flag) + an unstated attribute → unknown → NHR, NEVER INELIGIBLE.
 * (2) EXPLICIT closed-world profile + an unstated attribute → still "fails" → INELIGIBLE (proven-fail preserved).
 * Plus controls (held attribute clears; live-builder open-world). $0, no model calls.
 */
import { deriveVerdict, firmStatus, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts } from "@/lib/audit-decide";
import { buildBidderProfileFromCapability } from "@/lib/audit-bidder-profile";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };
// A NON-set-aside firm-credential bar (OEM approved-source) — it does NOT soften like a socioeconomic set-aside,
// so the default/open-world path lands cleanly on NHR (unknown), isolating the world-assumption fix.
const bar = (requiredAttribute: string): TypedFinding =>
  ({ requirement: "Offeror must hold the named OEM approved-source designation.", excerpt: "Award restricted to the approved-source designation holder.", requiredAttribute, citation: "§C", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "keyfact_detector", curableInWindow: false });
const inp = (f: TypedFinding[], p: BidderProfile | null): VerdictInputs =>
  ({ findings: applyAwardBasisOvertypeGuard(f, p, setAsideOvertypeGuardOpts(process.env)), bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true, documentsComplete: true } as VerdictInputs);

console.log("=== Anti-regression (1): DEFAULT profile + unstated attribute → NHR, never INELIGIBLE ===");
const dflt: BidderProfile = { satisfiedAttributes: [] };                       // no world flag → fail-safe open-world
ok(firmStatus(bar("se:wosb"), dflt) === "unknown", "firmStatus: default + unstated se:wosb → 'unknown' (not 'fails')");
const vDflt = deriveVerdict(inp([bar("se:wosb")], dflt)).verdict;
ok(vDflt !== "INELIGIBLE", `deriveVerdict: default + unstated → NOT INELIGIBLE (got ${vDflt})`);
ok(vDflt === "NEEDS_HUMAN_REVIEW", `deriveVerdict: default + unstated → NEEDS_HUMAN_REVIEW (got ${vDflt})`);
const dfltNonEmpty: BidderProfile = { satisfiedAttributes: ["se:hubzone"] };   // holds a DIFFERENT cert, WOSB unstated
ok(firmStatus(bar("se:wosb"), dfltNonEmpty) === "unknown", "firmStatus: default + holds-other-cert, target unstated → 'unknown'");

console.log("\n=== Anti-regression (2): EXPLICIT closed-world + unstated attribute → still fails → INELIGIBLE ===");
const closed: BidderProfile = { satisfiedAttributes: [], closedWorld: true };  // trusted/complete → proven-fail
ok(firmStatus(bar("se:wosb"), closed) === "fails", "firmStatus: closedWorld + unstated se:wosb → 'fails'");
const vClosed = deriveVerdict(inp([bar("se:wosb")], closed)).verdict;
ok(vClosed === "INELIGIBLE", `deriveVerdict: closedWorld + unstated → INELIGIBLE (got ${vClosed})`);

console.log("\n=== Controls ===");
ok(firmStatus(bar("se:wosb"), { satisfiedAttributes: ["se:wosb"] }) === "satisfies", "held attribute → 'satisfies' (exact match, any world)");
ok(firmStatus(bar("se:wosb"), { satisfiedAttributes: ["se:wosb"], closedWorld: true }) === "satisfies", "held attribute + closedWorld → 'satisfies'");
const built = buildBidderProfileFromCapability({ certifications: ["WOSB"] });
ok(built !== null && !built.closedWorld, "live builder produces an OPEN-WORLD profile (no closedWorld flag)");
ok(firmStatus(bar("se:sdvosb"), built as BidderProfile) === "unknown", "live-builder profile + unstated SDVOSB → 'unknown' (never false INELIGIBLE)");

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail) process.exit(1);
console.log("✅ ALL GREEN — fail-safe open-world default: unstated→NHR by default, INELIGIBLE only under EXPLICIT closedWorld.");
