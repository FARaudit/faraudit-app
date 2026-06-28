// $0 proof for N8 — the external manifest-reconciliation signal caps a no-bar verdict.
// Run: npx tsx src/lib/audit-n8-manifest-cap.test.ts
//
// The executor knows the DETERMINISTIC truth (every posted SAM doc ingested?) far more
// reliably than the orchestrator's internal page-count heuristic. N8 threads that signal
// into the verdict: a clean BID over an INCOMPLETE read becomes INCOMPLETE (honest), not
// a confident BID that only the export gate catches. Omitted/true = unchanged behavior.

import { runAgenticAudit } from "./audit-orchestrator";
import { type CallModel, type RawFinding } from "./audit-expert";
import type { AuditToolContext } from "./audit-tools";

// Same clean-BID scaffold as test-orchestrator: all 5 binding sections present + grounded.
const SRC = [
  "SECTION B - SUPPLIES AND PRICES",
  "Offerors shall submit pricing for all CLINs 0001 through 0005.",
  "SECTION C - STATEMENT OF WORK",
  "The contractor shall furnish one mini-excavator with a fully enclosed cab.",
  "SECTION I - CONTRACT CLAUSES",
  "52.219-6 Notice of Total Small Business Set-Aside is incorporated.",
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS",
  "Award will be made on a Lowest-Priced Technically Acceptable basis.",
].join("\n");
const ctx: AuditToolContext = { fullSource: SRC };

const F: Record<string, RawFinding> = {
  price: { requirement: "submit pricing for all CLINs", citation: "§B", excerpt: "pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" },
  cab:   { requirement: "enclosed cab", citation: "§C", excerpt: "fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" },
  setA:  { requirement: "small-business set-aside (firm qualifies)", citation: "§I", excerpt: "52.219-6", kind: "eligibility_bar", controllability: "already_satisfied" },
  coc:   { requirement: "Certificate of Conformance", citation: "§L", excerpt: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" },
  eval:  { requirement: "LPTA evaluation", citation: "§M", excerpt: "Lowest-Priced Technically Acceptable", kind: "other", controllability: "bidder_controls" },
};
const ALL = ["B", "C", "I", "L", "M"];
const stub: CallModel = async ({ system, priorToolResults }) =>
  priorToolResults.length === 0
    ? { toolCalls: ALL.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
    : { toolCalls: [], findings: ({ LENS_A: [F.price, F.cab, F.setA], LENS_B: [F.cab, F.coc, F.eval] } as Record<string, RawFinding[]>)[system] ?? [] };
const experts = [{ key: "capture", system: "LENS_A" }, { key: "ko", system: "LENS_B" }];

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

(async () => {
  const baseline = await runAgenticAudit({ ctx, experts, callModel: stub });
  eq("N8-1 · manifestComplete omitted → BID (unchanged baseline)", baseline.decision.verdict, "BID");

  const complete = await runAgenticAudit({ ctx, experts, callModel: stub, manifestComplete: true });
  eq("N8-2 · manifestComplete:true → BID (no external constraint)", complete.decision.verdict, "BID");

  const incomplete = await runAgenticAudit({ ctx, experts, callModel: stub, manifestComplete: false });
  eq("N8-3 · manifestComplete:false → INCOMPLETE (capped, honest)", incomplete.decision.verdict, "INCOMPLETE");
  eq("N8-4 · capped verdict is eligible:false (honest fail)", incomplete.decision.eligible, false);

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
