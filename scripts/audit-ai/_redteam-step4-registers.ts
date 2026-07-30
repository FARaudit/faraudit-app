/* RED-TEAM probe — PANEL-ON-DESIGN step 4 (verbatim-veto retirement). READ-ONLY, deterministic, no I/O.
 * Drives the SHIPPED importanceOf / hasBarSignal / gradeCoverageV2 / gateV2Outcome under the LIVE ARMED
 * worker flag set (dumped from `railway variables --service audit-worker --kv`, 2026-07-22).
 * `obligationsOf` is replicated VERBATIM from audit-orchestrator.ts:306-310 (module-private, cannot import). */

// ── LIVE ARMED WORKER FLAG SET (verbatim subset relevant to this path) ───────────────────────────────
for (const k of [
  "AUDIT_GATE_V2", "AUDIT_AMBIGUOUS_SIGNAL_DEMOTION", "AUDIT_COVERAGE_LEDGER_V2", "AUDIT_LEDGER_BROAD_AMBIGUOUS",
  "AUDIT_NOTICE_BODY_ELIG_FLOOR", "AUDIT_BENIGN_RECITAL_COVERED", "AUDIT_PERFORMANCE_UPKEEP_CAVEAT",
  "AUDIT_CONDITIONAL_TINA_DEMOTION", "AUDIT_PROTEST_CLAUSE_ALLOWLIST", "AUDIT_NOOP_REP_ALLOWLIST",
  "AUDIT_DEBRIEF_ALLOWLIST", "AUDIT_PRECEDENCE_ALLOWLIST", "AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS",
  "AUDIT_BOND_PAPER_NONBAR", "AUDIT_CREDENTIAL_CONDITIONAL_REASON", "AUDIT_COVERED_DIRECT_BAR_FLOOR",
  "AUDIT_ELIG_BAR_PASSIVE_FRAME",
]) process.env[k] = "true";
// AUDIT_SETASIDE_BACKSTOP is ABSENT from the live worker env ⇒ OFF. AUDIT_RETIRE_VERBATIM_VETO ⇒ OFF (toggled below).
delete process.env.AUDIT_SETASIDE_BACKSTOP;
delete process.env.AUDIT_RETIRE_VERBATIM_VETO;

async function main() {
const g = await import("../../src/lib/audit-gate-v2.js");
const { importanceOf, hasBarSignal, gradeCoverageV2, gateV2Outcome, GATE_V2_ENABLED } = g as any;

// VERBATIM from audit-orchestrator.ts:306-310
function obligationsOf(text: string): { obligations: string[]; truncated: boolean } {
  const all = text.split(/(?<=[.;\n])/).map((s) => s.trim())
    .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s));
  return { obligations: all.slice(0, 200), truncated: all.length > 200 };
}

const SPECIMENS: Array<{ id: string; sec: string; text: string }> = [
  { id: "R1  enumerated (1)/(2)/(3)", sec: "L", text: "To be eligible for award, an offeror must: (1) be registered in SAM; (2) possess an active TOP SECRET facility clearance at the time of proposal submission; (3) hold a CMMC Level 2 certification." },
  { id: "R1b enumerated, verbless lead", sec: "L", text: "Eligibility requirements are as follows: (1) active SAM registration; (2) an active TOP SECRET facility clearance at the time of proposal submission." },
  { id: "R2  submit-proof-with-offer §L", sec: "L", text: "Offerors shall submit a copy of their current FAA Part 145 Repair Station Certificate with their quotation." },
  { id: "R2b submit-proof, clearance object", sec: "L", text: "Offerors shall provide a copy of their current facility clearance certificate with the proposal." },
  { id: "R3  acceptability gate §M (a)", sec: "M", text: "Proposals from offerors lacking an active CMMC Level 2 certification will not be evaluated." },
  { id: "R3b acceptability gate §M (b)", sec: "M", text: "A proposal that does not demonstrate an active TOP SECRET facility clearance will be determined technically unacceptable and ineligible for award." },
  { id: "R4  DD-254 block-1 FIELD ONLY", sec: "H", text: "FCL required: SECRET. Contractor personnel access required at the SECRET level." },
  { id: "R4-prose main-loop specimen", sec: "H", text: "The contractor shall comply with the attached DD Form 254; a SECRET facility clearance is required." },
  { id: "R4-prose, FCL abbrev only", sec: "H", text: "The contractor shall comply with the attached DD Form 254; a SECRET FCL is required." },
  { id: "R4b SF1449 block 10", sec: "B", text: "THIS ACQUISITION IS SET ASIDE FOR: X SMALL BUSINESS" },
  { id: "CTRL clearance prose bar", sec: "L", text: "Offerors must possess an active TOP SECRET facility clearance at the time of proposal submission." },
  { id: "CD-FLOOR §H co-resident bar", sec: "H", text: "The Contractor shall maintain a facility clearance at the SECRET level. Offerors must hold a facility clearance at the SECRET level to be eligible for award." },
];

console.log(`GATE_V2_ENABLED=${GATE_V2_ENABLED}\n`);
for (const s of SPECIMENS) {
  const { obligations } = obligationsOf(s.text);
  console.log(`── ${s.id}  §${s.sec}`);
  console.log(`   enumerated: ${obligations.length}`);
  for (const o of obligations) console.log(`     · imp=${importanceOf(o).padEnd(12)} bar=${String(hasBarSignal(o)).padEnd(5)} :: ${JSON.stringify(o.slice(0, 96))}`);
  const att = [{ section: s.sec, status: "obligations_ungrounded" as const, obligations, citedFindingIds: [], ungrounded: obligations }];
  const cov = gradeCoverageV2(att);
  console.log(`   buckets: disq=${cov.disqualifierUncovered.length} nonBar=${(cov.ungroundedNonBarSignal ?? []).length} benign=${(cov.benignCoveredRecital ?? []).length} caveat=${(cov.caveatRecital ?? []).length}`);
  delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
  const off = gateV2Outcome(cov);
  process.env.AUDIT_RETIRE_VERBATIM_VETO = "true";
  const on = gateV2Outcome(cov);
  delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
  console.log(`   CAP flag-OFF=${off.cap ?? "null"}   flag-ON=${on.cap ?? "null"}   DELTA=${(off.cap ?? "null") !== (on.cap ?? "null") ? "YES" : "no"}`);
  if (off.cap) console.log(`   OFF reason: ${off.reason.slice(0, 170)}`);
  console.log("");
}
}
main();
