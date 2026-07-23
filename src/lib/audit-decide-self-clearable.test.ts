// GAUNTLET — SELF_CLEARABLE_PACKAGE recognizer (card #590 Modified-B). Run:
//   AUDIT_SELF_CLEARABLE_PACKAGE=true npx tsx src/lib/audit-decide-self-clearable.test.ts
// Positive: a fully-typed self-clearable bar set → BID_WITH_CAUTION + named caveats. Red-team (must stay NHR/inert):
// buried CMMC/clearance, at-award possession, untyped bar, non-curable, no_one_can_move, unsound verifier, flag-OFF.
import { deriveVerdict } from "./audit-decide";
import type { TypedFinding, VerdictInputs } from "./audit-findings";
// SELF-ARM (card #697): the standard runner (`_gauntlet-replay.sh` → bare `npx tsx <file>`) passes NO env.
// Without this line the POSITIVE arm silently measures the flag-OFF legacy path and reports a false RED —
// the same value (`BID`) that the flag-OFF arm below asserts is CORRECT. Sibling suites self-arm identically
// (audit-decide-incomplete-precedence.test.ts:9, audit-decide-temporal.test.ts:53); the flag is read at CALL
// time (proved by the flag-OFF arm's mid-run delete), so placement after the imports is behaviour-equivalent.
// Live worker carries AUDIT_SELF_CLEARABLE_PACKAGE=true, so this is the production configuration.
process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
let fail = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

const bar = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "req", citation: "§K", excerpt: "ex", kind: "eligibility_bar", controllability: "bidder_controls",
  grounded: true, lens: "small_business", severity: "P2", requiredAttribute: "attr", curableInWindow: true, ...o,
});
// real-material self-cert bars (the LBJ-class: SAM, licensure, insurance, size — all bidder-self-determinable + typed)
const SELF_CERT = [
  bar({ requirement: "Active SAM.gov registration required (52.204-7).", requiredAttribute: "sam_registration" }),
  bar({ requirement: "RN must hold active, unrestricted state license.", requiredAttribute: "rn_license" }),
  bar({ requirement: "Maintain malpractice insurance at minimum $1M per occurrence.", requiredAttribute: "insurance" }),
  bar({ requirement: "Bidder must qualify as small under NAICS 561320 ($34M).", requiredAttribute: "size_standard" }),
];
const base = (findings: TypedFinding[], over: Partial<VerdictInputs> = {}): VerdictInputs => ({
  findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false,
  documentsComplete: true, manifestComplete: true, source: "sol", ...over,
});
const V = (findings: TypedFinding[], over?: Partial<VerdictInputs>) => deriveVerdict(base(findings, over)).verdict;

console.log("\n── POSITIVE (real-material self-cert bars, verifierSound=true, flag-ON) ──");
const pos = deriveVerdict(base(SELF_CERT));
ok(pos.verdict === "BID_WITH_CAUTION", `self-clearable package → BID_WITH_CAUTION (got ${pos.verdict})`);
ok(/SAM|registration/i.test(pos.reason) && /license/i.test(pos.reason), "reason enumerates the named self-cert caveats");

console.log("\n── RED-TEAM (must NOT commit — recognizer inert → existing NHR/INELIGIBLE) ──");
ok(V([...SELF_CERT, bar({ requirement: "Contractor must hold CMMC Level 2 certification.", requiredAttribute: "cmmc" })]) !== "BID_WITH_CAUTION", "buried CMMC (long-lead) → NOT committal");
ok(V([...SELF_CERT, bar({ requirement: "Offeror must possess a Secret facility clearance.", requiredAttribute: "fcl" })]) !== "BID_WITH_CAUTION", "buried facility clearance (long-lead) → NOT committal");
ok(V([...SELF_CERT, bar({ requirement: "Offeror must hold the license at time of award.", requiredAttribute: "x", controllability: "bidder_cannot_move", curableInWindow: false })]) !== "BID_WITH_CAUTION", "at-award possession + non-curable → NOT committal");
ok(V([...SELF_CERT, bar({ requirement: "Some disqualifying bar", requiredAttribute: undefined, controllability: "bidder_cannot_move" })]) !== "BID_WITH_CAUTION", "untyped disqualifier (no requiredAttribute) → NOT committal");
ok(V([...SELF_CERT, bar({ requirement: "No offeror can comply", controllability: "no_one_can_move", curableInWindow: false })]) !== "BID_WITH_CAUTION", "no_one_can_move → NOT committal");
ok(V(SELF_CERT, { verifierSound: false }) === "NEEDS_HUMAN_REVIEW", "verifierSound=false → NHR (verifier sovereign; recognizer never reached)");

console.log("\n── FLAG-OFF byte-identity (recognizer never runs) ──");
delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
const off = deriveVerdict(base(SELF_CERT)).verdict;
ok(off !== "BID_WITH_CAUTION", `flag-OFF: self-cert set does NOT hit the recognizer (got ${off}) — byte-identical legacy path`);
process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";

console.log(`\n${fail === 0 ? "🟢 DRY — SELF_CLEARABLE_PACKAGE Gauntlet PASSES" : `❌ ${fail} FAIL`}`);
process.exit(fail === 0 ? 0 : 1);
