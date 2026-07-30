/* RED-TEAM probe 3 — END-TO-END proof for PANEL-STEP4-REDTEAM §0.2 / FAIL-2.
 * Drives the REAL completenessOf (which owns the armed AUDIT_COVERED_DIRECT_BAR_FLOOR block) over a minimal
 * AuditToolContext, then the REAL gradeCoverageV2 + gateV2Outcome, flag OFF vs ON. No synthetic attestation.
 * READ-ONLY, deterministic, no network. Closes the "(ii) not verified" item in §9. */
for (const k of ["AUDIT_GATE_V2", "AUDIT_AMBIGUOUS_SIGNAL_DEMOTION", "AUDIT_COVERAGE_LEDGER_V2",
  "AUDIT_LEDGER_BROAD_AMBIGUOUS", "AUDIT_BENIGN_RECITAL_COVERED", "AUDIT_PERFORMANCE_UPKEEP_CAVEAT",
  "AUDIT_COVERED_DIRECT_BAR_FLOOR", "AUDIT_ELIG_BAR_PASSIVE_FRAME", "AUDIT_CREDENTIAL_CONDITIONAL_REASON",
]) process.env[k] = "true";
delete process.env.AUDIT_RETIRE_VERBATIM_VETO;

// A §H "Special Contract Requirements" carrying ONE benign GROUNDED finding + a co-resident UNGROUNDED bar.
// This is the exact shape the covered_direct blanket short-circuit used to certify covered.
const H_TEXT = [
  "SECTION H — SPECIAL CONTRACT REQUIREMENTS",
  "H.1 The Contractor shall provide monthly status reports to the Contracting Officer Representative.",
  "H.2 Offerors must hold a facility clearance at the SECRET level to be eligible for award.",
].join("\n");

async function main() {
  const { completenessOf } = await import("../../src/lib/audit-orchestrator.js");
  const { gradeCoverageV2, gateV2Outcome } = await import("../../src/lib/audit-gate-v2.js");

  const ctx: any = { fullSource: H_TEXT, sections: { H: H_TEXT } };
  // the ONE grounded, benign finding — cited to §H, excerpt verbatim in §H (what triggers covered_direct)
  const findings: any[] = [{
    id: "f1", citation: "§H.1", requirement: "Monthly status reports",
    excerpt: "The Contractor shall provide monthly status reports to the Contracting Officer Representative.",
    kind: "deliverable", controllability: "bidder_controls", grounded: true,
  }];

  for (const armed of [true, false]) {
    process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = String(armed);
    const { covered, missing, attestations } = completenessOf(ctx, ["H"], findings, new Set(["H"]));
    const att: any = attestations[0];
    console.log(`\n=== AUDIT_COVERED_DIRECT_BAR_FLOOR=${armed} ===`);
    console.log(`   §H status=${att.status}  covered=[${covered}] missing=[${missing}]`);
    console.log(`   ungrounded emitted: ${JSON.stringify(att.ungrounded)}`);
    const cov = gradeCoverageV2(attestations as any);
    console.log(`   disqualifierUncovered=${cov.disqualifierUncovered.length} nonBar=${(cov.ungroundedNonBarSignal ?? []).length}`);
    delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
    const off = gateV2Outcome(cov);
    process.env.AUDIT_RETIRE_VERBATIM_VETO = "true";
    const on = gateV2Outcome(cov);
    delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
    console.log(`   CAP  retire-OFF=${off.cap ?? "null"}   retire-ON=${on.cap ?? "null"}`);
    if (off.cap) console.log(`   OFF reason: ${off.reason.slice(0, 150)}`);
  }
}
main();
