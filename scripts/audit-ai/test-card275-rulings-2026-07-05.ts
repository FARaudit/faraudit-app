// $0 regression gate for the four VERDICT-DOCTRINE rulings Brain issued on card 275 (2026-07-05, stage-8 re-audit).
//  R1 — award-basis guard clause (a) REMOVED: a no_one_can_move award-basis finding is no longer silently
//        re-typed to bidder_controls (silent BID); it stays no_one_can_move → Fork-2 → NHR.
//  R2 — structural-whitelist: possession-cert bars (CMMC L1/L2/L3, clearances, ATO) are STRUCTURAL → kept → NHR,
//        never a soft caution; only representation FILINGS (reps&certs, self-cert, SAM registration) may soften.
//  R3 — verified-floor: MATERIAL emptiness (all boilerplate/all dropped) → NHR, never default BID.
//  R4b — judgment-sourced committal NO_BID is SUPPRESSED to NHR unless the four-walls seal is present.
// Run: npx tsx scripts/audit-ai/test-card275-rulings-2026-07-05.ts
import { deriveVerdict, applyAwardBasisOvertypeGuard, applyStructuralBarWhitelist, firmStatus, excerptHash, registerVerifier } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

const f = (o: Partial<TypedFinding> & { kind: TypedFinding["kind"]; controllability: TypedFinding["controllability"] }): TypedFinding => ({
  requirement: o.requirement ?? "requirement", citation: o.citation ?? "FAR 52.x", excerpt: o.excerpt ?? "verbatim source span", grounded: true, lens: o.lens ?? "x",
  kind: o.kind, controllability: o.controllability, requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow, universalDefect: o.universalDefect, verifiedBy: o.verifiedBy,
});
const inp = (findings: TypedFinding[], o: { profile?: BidderProfile | null } = {}): VerdictInputs =>
  ({ findings, bidderProfile: o.profile ?? null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };

// ── R1 — award-basis clause (a) removed: no silent BID off an unverified downgrade ───────────────────────
console.log("R1 — award-basis no_one_can_move stays no_one_can_move → NHR (no silent BID)");
const awardBasisUniversal = f({ requirement: "award made on best value tradeoff; non-price factors screened", kind: "technical_spec", controllability: "no_one_can_move" });
const g1 = applyAwardBasisOvertypeGuard([awardBasisUniversal], null, { enabled: true });
check("guard NO LONGER re-types the award-basis no_one_can_move to bidder_controls", g1[0].controllability === "no_one_can_move", `got ${g1[0].controllability}`);
check("no awardBasisGuard downgrade flag set on it", g1[0].awardBasisGuard !== true);
check("deriveVerdict over it → NEEDS_HUMAN_REVIEW (Fork-2 unmarked universal), never a BID", deriveVerdict(inp(g1)).verdict === "NEEDS_HUMAN_REVIEW");

// ── R2 — possession-cert bars are structural (→ NHR); representation filings still soften ─────────────────
console.log("\nR2 — CMMC/possession certs kept as structural bars; reps&certs still soften");
const cmmc = f({ requirement: "Contractor must hold CMMC Level 2 certification at time of award", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
const w2 = applyStructuralBarWhitelist([cmmc], null, { enabled: true });
check("CMMC L2 possession bar → KEPT as non-curable bar (not softened to caution)", w2[0].controllability === "bidder_cannot_move" && w2[0].curableInWindow === false);
check("CMMC L2 kept → deriveVerdict → NEEDS_HUMAN_REVIEW (never BID_WITH_CAUTION)", deriveVerdict(inp(w2)).verdict === "NEEDS_HUMAN_REVIEW");
const clearance = f({ requirement: "personnel must hold an active Secret clearance", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false });
check("Secret clearance possession bar → still kept (regression guard)", applyStructuralBarWhitelist([clearance], null, { enabled: true })[0].controllability === "bidder_cannot_move");
const repsCerts = f({ requirement: "submit annual representations and certifications (reps and certs) via SAM", kind: "submission", controllability: "bidder_cannot_move", curableInWindow: false });
const w2b = applyStructuralBarWhitelist([repsCerts], null, { enabled: true });
check("reps & certs FILING → still SOFTENS to a curable caution (bidder-resolvable)", w2b[0].controllability === "bidder_controls" && w2b[0].cautionFloor === true);

// ── R3 — verified-floor: material (not literal) emptiness → NHR ───────────────────────────────────────────
console.log("\nR3 — all-boilerplate / all-dropped verified set → NHR, never default BID");
const allBoilerplate = [
  f({ requirement: "Anti-Discrimination / DEI clause", kind: "boilerplate", controllability: "bidder_controls" }),
  f({ requirement: "standard FAR order of precedence", kind: "boilerplate", controllability: "bidder_controls" }),
];
check("all-boilerplate (all dropped) set over complete coverage → NEEDS_HUMAN_REVIEW", deriveVerdict(inp(allBoilerplate)).verdict === "NEEDS_HUMAN_REVIEW");
check("empty finding set → still NEEDS_HUMAN_REVIEW (literal-empty covered)", deriveVerdict(inp([])).verdict === "NEEDS_HUMAN_REVIEW");
const oneRealGate = [...allBoilerplate, f({ requirement: "submit pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" })];
check("ONE non-dropped survivor among boilerplate → NOT caught by the material-empty guard (proceeds to BID)", deriveVerdict(inp(oneRealGate)).verdict === "BID");

// ── R4b — judgment committal NO_BID suppressed to NHR without the four-walls seal ─────────────────────────
console.log("\nR4b — verified universalDefect suppressed to NHR unless the four-walls seal is present");
registerVerifier("test:sim-verifier-275");
const verifiedDefect = f({ requirement: "5-day delivery and a 90-day non-waivable FAT gate cannot both be met by any offeror", kind: "technical_spec", controllability: "no_one_can_move",
  universalDefect: "contradictory_mandatory_terms", excerpt: "the 5-day delivery and 90-day FAT are both mandatory", verifiedBy: { verifierId: "test:sim-verifier-275", excerptHash: excerptHash("the 5-day delivery and 90-day FAT are both mandatory"), affirmation: "the contradiction follows from the cited excerpt" } });
const prevTri = process.env.AUDIT_ELIGIBLE_TRISTATE, prevFW = process.env.AUDIT_FOURWALLS_NOBID;
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
delete process.env.AUDIT_FOURWALLS_NOBID; // default: no seal
check("verified universalDefect, tristate on, NO four-walls seal → suppressed to NHR (never committal NO_BID)", deriveVerdict(inp([verifiedDefect])).verdict === "NEEDS_HUMAN_REVIEW");
process.env.AUDIT_FOURWALLS_NOBID = "true"; // seal present → the NO_BID mechanism is reachable
check("verified universalDefect + four-walls seal → NO_BID reachable (mechanism intact)", deriveVerdict(inp([verifiedDefect])).verdict === "NO_BID");
if (prevTri === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prevTri;
if (prevFW === undefined) delete process.env.AUDIT_FOURWALLS_NOBID; else process.env.AUDIT_FOURWALLS_NOBID = prevFW;

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
