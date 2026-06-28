// $0 proofs for the final-greenlight panel (Lens B) fixes. Run: npx tsx src/lib/audit-panelB-fixes.test.ts
//   B-1 false-green: the award-basis (a) downgrade must NOT erase a genuine supply/structural
//        impossibility whose verbatim excerpt happens to quote evaluation language.
//   B-2 false-green: a UCF package missing a CORE section caps a no-bar verdict to INCOMPLETE.
//   B-3 regression: an OPEN-WORLD profile gets the over-type guards (must not be bypassed).

import { applyAwardBasisOvertypeGuard, applyStructuralBarWhitelist } from "./audit-decide";
import { runAgenticAudit } from "./audit-orchestrator";
import { type CallModel, type RawFinding } from "./audit-expert";
import type { AuditToolContext } from "./audit-tools";
import type { TypedFinding, BidderProfile } from "./audit-findings";

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want; if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const tf = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: o.requirement ?? "r", citation: o.citation ?? "§C", excerpt: o.excerpt ?? "x",
  kind: o.kind ?? "eligibility_bar", controllability: o.controllability ?? "no_one_can_move",
  grounded: true, lens: o.lens ?? "ko", requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow,
});
const ON = { enabled: true };

// ── B-1 — supply/structural impossibility with an LPTA phrase in the excerpt is NOT downgraded ──
const supplyImposs = tf({ requirement: "required item is no longer manufactured and has no acceptable substitute", excerpt: "Award will be made on a lowest price technically acceptable basis to the offeror...", controllability: "no_one_can_move", lens: "ko" });
eq("B1 · supply impossibility w/ LPTA-in-excerpt → NOT downgraded (stays no_one_can_move)",
  applyAwardBasisOvertypeGuard([supplyImposs], null, ON)[0].controllability, "no_one_can_move");
const soleSourceImposs = tf({ requirement: "sole source to the named OEM", excerpt: "...evaluated using best value trade-off and non-price factors...", controllability: "no_one_can_move", lens: "ko" });
eq("B1 · sole-source impossibility w/ best-value-in-excerpt → NOT downgraded",
  applyAwardBasisOvertypeGuard([soleSourceImposs], null, ON)[0].controllability, "no_one_can_move");
// Gold-preserving: a GENUINE award-basis mis-type (requirement IS the methodology) still downgrades.
const realAwardBasis = tf({ requirement: "award on a lowest price technically acceptable (LPTA) evaluation methodology", excerpt: "The Government will award to the LPTA offeror.", controllability: "no_one_can_move", lens: "ko" });
eq("B1 · genuine LPTA award-basis mis-type → still downgraded (gold preserved)",
  applyAwardBasisOvertypeGuard([realAwardBasis], null, ON)[0].controllability, "bidder_controls");

// ── B-3 — open-world profile gets the over-type guards (not bypassed) ──
const openWorld: BidderProfile = { satisfiedAttributes: ["se:wosb"], openWorld: true };
const closedWorld: BidderProfile = { satisfiedAttributes: ["se:wosb"] };
// structural-whitelist: a bidder-resolvable compliance bar (size-standard), non-curable, over-typed.
const compRepBar = tf({ requirement: "offeror must resolve a size-standard discrepancy / NAICS size representation", excerpt: "size standard representation under FAR 52.204-8", controllability: "bidder_cannot_move", curableInWindow: false, kind: "eligibility_bar" });
eq("B3 · structural-whitelist FIRES under OPEN-WORLD profile (compliance → caution)",
  applyStructuralBarWhitelist([compRepBar], openWorld, ON)[0].controllability, "bidder_controls");
eq("B3 · structural-whitelist SKIPPED under CLOSED-WORLD profile (firmStatus governs)",
  applyStructuralBarWhitelist([compRepBar], closedWorld, ON)[0].controllability, "bidder_cannot_move");
// award-basis (b): a socioeconomic set-aside under open-world normalizes to a caution.
const setAside = tf({ requirement: "WOSB set-aside", excerpt: "set aside for women-owned small business (WOSB)", controllability: "bidder_cannot_move", kind: "eligibility_bar" });
const guardedOW = applyAwardBasisOvertypeGuard([setAside], openWorld, ON)[0];
eq("B3 · award-basis(b) FIRES under OPEN-WORLD (set-aside → caution gate)", guardedOW.controllability, "bidder_controls");
eq("B3 · award-basis(b) marks cautionFloor under open-world", guardedOW.cautionFloor, true);

// ── B-2 — UCF package missing core §M caps a no-bar verdict to INCOMPLETE ──
// Source has B/C/I/L (UCF) but NO §M section present at all.
const SRC_NO_M = [
  "SECTION B - SUPPLIES AND PRICES", "Offerors shall submit pricing for all CLINs.",
  "SECTION C - STATEMENT OF WORK", "The contractor shall furnish one widget.",
  "SECTION I - CONTRACT CLAUSES", "52.219-6 small business set-aside incorporated.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Submit a Certificate of Conformance.",
].join("\n");
const ctxNoM: AuditToolContext = { fullSource: SRC_NO_M };
const F: Record<string, RawFinding> = {
  price: { requirement: "submit pricing", citation: "§B", excerpt: "pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" },
  sow: { requirement: "furnish one widget", citation: "§C", excerpt: "furnish one widget", kind: "technical_spec", controllability: "bidder_controls" },
  coc: { requirement: "Certificate of Conformance", citation: "§L", excerpt: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" },
};
const READ = ["B", "C", "I", "L"];
const stub: CallModel = async ({ system, priorToolResults }) =>
  priorToolResults.length === 0
    ? { toolCalls: READ.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
    : { toolCalls: [], findings: ({ LENS_A: [F.price, F.sow], LENS_B: [F.coc] } as Record<string, RawFinding[]>)[system] ?? [] };
const experts = [{ key: "a", system: "LENS_A" }, { key: "b", system: "LENS_B" }];

(async () => {
  const res = await runAgenticAudit({ ctx: ctxNoM, experts, callModel: stub });
  eq("B2 · UCF core §M detected missing", res.coverage.coreMissing.includes("M"), true);
  eq("B2 · missing core section caps no-bar verdict → INCOMPLETE (was green BID)", res.decision.verdict, "INCOMPLETE");

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
