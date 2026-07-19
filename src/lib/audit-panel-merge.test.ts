// $0 PROOF for the PANEL FINDINGS MERGE (card #523, P2a-wire) — the customer-path seam.
// Run: npx tsx src/lib/audit-panel-merge.test.ts
//
// Proves the executor→auditPackage→runAgenticAudit `panelFindings` union: (1) absent/empty ⇒ BYTE-IDENTICAL
// (flag-OFF customer path unchanged); (2) a GROUNDED panel fact REACHES the finding set deriveVerdict disposes
// over (provenance id preserved); (3) an UNGROUNDED panel excerpt is DROPPED (fail-safe re-grounding, Rule 64);
// (4) a GROUNDED unmet-eligibility bar from the panel actually MOVES the pole off the clean BID — i.e. the panel
// feeds the SOLE authority. Same clean-BID scaffold as audit-4a-naics-plumb.test.ts (all 5 sections grounded).
import { runAgenticAudit } from "./audit-orchestrator";
import { type CallModel, type RawFinding } from "./audit-expert";
import type { AuditToolContext } from "./audit-tools";
import type { TypedFinding } from "./audit-findings";

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
  coc:   { requirement: "Certificate of Conformance", citation: "§L", excerpt: "Submit a Certificate of Conformance", kind: "submission", controllability: "bidder_controls" },
  eval:  { requirement: "LPTA evaluation", citation: "§M", excerpt: "Lowest-Priced Technically Acceptable", kind: "other", controllability: "bidder_controls" },
};
const ALL = ["B", "C", "I", "L", "M"];
const stub: CallModel = async ({ system, priorToolResults }) =>
  priorToolResults.length === 0
    ? { toolCalls: ALL.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
    : { toolCalls: [], findings: ({ LENS_A: [F.price, F.cab, F.setA], LENS_B: [F.cab, F.coc, F.eval] } as Record<string, RawFinding[]>)[system] ?? [] };
const experts = [{ key: "capture", system: "LENS_A" }, { key: "ko", system: "LENS_B" }];

// A GROUNDED advisory panel risk (excerpt verbatim in SRC) — additive, never a bar.
const panelRisk: TypedFinding = {
  id: "panel:pricing_analyst:R1", requirement: "wage determination applicability", citation: "SCA",
  excerpt: "Certificate of Conformance with the offer", kind: "other", controllability: "bidder_controls", grounded: true, lens: "Pricing", severity: "P1",
};
// A GROUNDED unmet-eligibility bar (excerpt verbatim in SRC), fail-closed shape from the bridge.
const panelBar: TypedFinding = {
  id: "panel:ex_ko:G1", requirement: "SDVOSB set-aside eligibility", citation: "52.219-6",
  excerpt: "52.219-6 Notice of Total Small Business Set-Aside", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "Ex-KO",
};
// An UNGROUNDED panel fact (excerpt NOT in SRC) — must be dropped by re-grounding.
const panelGhost: TypedFinding = {
  id: "panel:cyber:G1", requirement: "facility clearance", citation: "DD254",
  excerpt: "This solicitation requires an active facility clearance", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "Cyber",
};

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want; if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

(async () => {
  const baseline = await runAgenticAudit({ ctx, experts, callModel: stub });
  eq("merge-1 · baseline (no panelFindings) → BID", baseline.decision.verdict, "BID");

  // (1) empty/absent ⇒ byte-identical decision + findings
  const emptyPanel = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: [] });
  eq("merge-2 · panelFindings:[] → decision BYTE-IDENTICAL", JSON.stringify(emptyPanel.decision), JSON.stringify(baseline.decision));
  eq("merge-3 · panelFindings:[] → findings BYTE-IDENTICAL", JSON.stringify(emptyPanel.findings), JSON.stringify(baseline.findings));

  // (3) an ungrounded panel fact is dropped ⇒ byte-identical to baseline (fail-safe re-grounding)
  const ghost = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: [panelGhost] });
  eq("merge-4 · ungrounded panel fact DROPPED → decision BYTE-IDENTICAL", JSON.stringify(ghost.decision), JSON.stringify(baseline.decision));
  eq("merge-5 · ungrounded panel fact absent from final findings", ghost.findings.some((f) => f.id === "panel:cyber:G1"), false);

  // (2) a grounded advisory risk REACHES the finding set (provenance id preserved), verdict stays BID (additive)
  const withRisk = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: [panelRisk] });
  eq("merge-6 · grounded panel risk REACHES final findings (id preserved)", withRisk.findings.some((f) => f.id === "panel:pricing_analyst:R1"), true);
  eq("merge-7 · a grounded advisory risk does NOT bar → still BID", withRisk.decision.verdict, "BID");

  // (4) a grounded unmet eligibility bar from the panel MOVES the pole off the clean BID (reaches deriveVerdict)
  const withBar = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: [panelBar] });
  eq("merge-8 · grounded panel bar reaches the SOLE authority → verdict NO LONGER plain BID", withBar.decision.verdict !== "BID", true);

  // ── 2c ABSENCE-GROUNDING GATE (flag AUDIT_ABSENCE_GROUNDING_GATE) — declaration ≠ presence ──
  // A finding whose requirement falsely asserts "no Section B" while Section B is present in the package.
  const panelFalseAbsence: TypedFinding = {
    id: "panel:proposal:R2", requirement: "The package contains no Section B pricing schedule — coverage is incomplete.",
    citation: "§B", excerpt: "SECTION B - SUPPLIES AND PRICES", kind: "other", controllability: "bidder_controls", grounded: true, lens: "Proposal",
  };
  // flag OFF (default) — the contradicted absence finding SURVIVES (gate inert, byte-identical)
  const absOff = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: [panelFalseAbsence] });
  eq("2c-1 · absence gate OFF → false 'no Section B' finding SURVIVES", absOff.findings.some((f) => f.id === "panel:proposal:R2"), true);
  // flag ON — dropped deterministically (Section B is present)
  process.env.AUDIT_ABSENCE_GROUNDING_GATE = "true";
  const absOn = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: [panelFalseAbsence] });
  delete process.env.AUDIT_ABSENCE_GROUNDING_GATE;
  eq("2c-2 · absence gate ON → false 'no Section B' finding DROPPED", absOn.findings.some((f) => f.id === "panel:proposal:R2"), false);

  // ── PARALLELIZE byte-identity (card #570, flag AUDIT_PANEL_PARALLEL) — the perf refactor MUST NOT change the union ──
  // For each producer-findings fixture, the SERIAL path (panelFindings: X) and the PARALLEL path (panelFindingsPromise:
  // Promise.resolve(X)) must produce a BYTE-IDENTICAL decision AND finding set. This proves the concurrency change is
  // pure wall-clock — same set in, same merge point (:2232), same dedup order — never a finding-set change.
  const parallelCases: Array<[string, TypedFinding[]]> = [
    ["empty", []],
    ["grounded advisory risk", [panelRisk]],
    ["grounded eligibility bar (pole-mover)", [panelBar]],
    ["ungrounded ghost (dropped)", [panelGhost]],
    ["mixed set", [panelRisk, panelBar, panelGhost]],
  ];
  for (const [label, X] of parallelCases) {
    const serial = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindings: X });
    const parallel = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindingsPromise: Promise.resolve(X) });
    eq(`parallel · ${label} → decision IDENTICAL to serial`, JSON.stringify(parallel.decision), JSON.stringify(serial.decision));
    eq(`parallel · ${label} → findings IDENTICAL to serial (same set + order)`, JSON.stringify(parallel.findings), JSON.stringify(serial.findings));
  }
  // Producer promise that resolves to undefined (honest-fail producer under parallel) ⇒ identical to serial panelFindings: undefined.
  const serialNone = await runAgenticAudit({ ctx, experts, callModel: stub });
  const parallelNone = await runAgenticAudit({ ctx, experts, callModel: stub, panelFindingsPromise: Promise.resolve(undefined) });
  eq("parallel · producer honest-fail (undefined) → decision IDENTICAL to no-panel serial", JSON.stringify(parallelNone.decision), JSON.stringify(serialNone.decision));
  eq("parallel · producer honest-fail (undefined) → findings IDENTICAL to no-panel serial", JSON.stringify(parallelNone.findings), JSON.stringify(serialNone.findings));

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
