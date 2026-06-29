// $0 NEGATIVE proof for Step 4a — the NAICS/set-aside scalar-fact plumb changes NO verdict.
// Run: npx tsx src/lib/audit-4a-naics-plumb.test.ts
//
// 4a threads the SAM-resolved naics + setAside FACTS through OrchestratorInput so the future
// Step-4 Nonmanufacturer-Rule gate can read them without regexing source. In 4a NOTHING reads
// them, so the verdict — and every byte of the decision — must be IDENTICAL with the fields set
// vs omitted, and with a present NAICS vs null. A data plumb that moves a verdict is a bug.

import { runAgenticAudit } from "./audit-orchestrator";
import { type CallModel, type RawFinding } from "./audit-expert";
import type { AuditToolContext } from "./audit-tools";

// Same clean-BID scaffold as the N8 / orchestrator tests: all 5 binding sections present + grounded,
// a Total-SB set-aside under a supply NAICS (336413) — the exact shape Step-4's NMR gate will trigger on.
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
  // Baseline — fields omitted entirely (pre-4a behavior).
  const baseline = await runAgenticAudit({ ctx, experts, callModel: stub });
  eq("4a-1 · baseline (no facts) → BID", baseline.decision.verdict, "BID");

  // Facts SET to a real supply set-aside (what Step-4's NMR gate will fire on).
  const withFacts = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside" });

  // Facts present but NULL (the upload path — honest silence).
  const withNull = await runAgenticAudit({ ctx, experts, callModel: stub, naics: null, setAside: null });

  // THE NEGATIVE: setting the facts moves nothing — the entire decision is byte-identical.
  eq("4a-2 · naics+setAside set → decision BYTE-IDENTICAL to baseline",
     JSON.stringify(withFacts.decision), JSON.stringify(baseline.decision));
  eq("4a-3 · naics+setAside null → decision BYTE-IDENTICAL to baseline",
     JSON.stringify(withNull.decision), JSON.stringify(baseline.decision));
  // And the whole findings set is untouched (gate pipeline did not act on the new facts).
  eq("4a-4 · findings BYTE-IDENTICAL with facts set",
     JSON.stringify(withFacts.findings), JSON.stringify(baseline.findings));

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
