/**
 * RED-TEAM Unit #12 R1 — PRODUCTION-COMPOSITION probe.
 * Drives the REAL orchestrator coverage path:
 *   completenessOf(ctx, required, findings, sectionsRead)  ← the exported production function
 *     → hits the read_no_obligation valve at audit-orchestrator.ts:1581-1595
 *     → the garble floor at :1591 (looksGarbled) when AUDIT_OBLIGATION_GARBLE_FLOOR=true
 *   → missing[]  → coverageComplete = missing.length===0  (mirrors orchestrator:2030 for the section leg)
 *   → deriveVerdict({ coverageComplete, ... })  → INCOMPLETE when a clean section is falsely floored.
 *
 * We stub NOTHING in the coverage logic. Sections are supplied explicitly on ctx.sections
 * (the same map sectionFullText/readSection read via sectionsOf), findings=[] and no direct
 * finding cites the section, so obligationsOf(text)===[] → the valve path → the garble floor.
 *
 * A clean CLIN/wage section that lands INCOMPLETE (vs read_no_obligation covered) is a P0/P1
 * OVER-FIRE: a genuinely-covered section routed to human review.
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

// Clean columnar wage table (no obligation verbs) — reused from the discriminator probe.
const WAGE_TABLE = `WD 05-2103 (Rev.-24)   Area: TX San Antonio, Bexar County
OCCUPATION CODE   TITLE                                RATE      H&W    VACATION
01011             Accounting Clerk I                   18.55     5.36   2 wks
01012             Accounting Clerk II                  20.81     5.36   2 wks
01020             Administrative Assistant             27.44     5.36   2 wks
01111             General Clerk I                      15.90     5.36   2 wks
01311             Secretary I                          22.10     5.36   2 wks
23370             General Maintenance Worker           19.63     5.36   2 wks
25010             Fuel Distribution System Operator    24.88     5.36   2 wks
31361             Truck Driver Heavy                    23.55     5.36   2 wks
Fringe HEALTH WELFARE 5.36 hr   HOLIDAYS 11   UNIFORM ALLOWANCE 52.222-51`;

const CLIN_GRID = `CLIN    SUPPLIES/SERVICES                         QTY   UNIT   UNIT PRICE   AMOUNT
0001AA  Base Year Labor - Program Manager          1    LOT    0.00     0.00
0001AB  Base Year Labor - Sr Analyst              12    MO     0.00     0.00
0001AC  Base Year Labor - Analyst II              12    MO     0.00     0.00
0002AA  ODC - Travel                               1    LOT    0.00     0.00
1001AA  Option Year 1 - Program Manager            1    LOT    0.00     0.00
1001AB  Option Year 1 - Sr Analyst                12    MO     0.00     0.00
2001AA  Option Year 2 - Program Manager            1    LOT    0.00     0.00
3001AA  Option Year 3 - Program Manager            1    LOT    0.00     0.00
4001AA  Option Year 4 - Program Manager            1    LOT    0.00     0.00
NSN 7540-01-152-8064   PSC R408   NAICS 541611   FPDS G002`;

function mkCtx(section: string, text: string): AuditToolContext {
  return { fullSource: text, sections: { [section]: text } };
}

function runOne(label: string, section: string, text: string, garbleFloor: boolean, txtIngest: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = garbleFloor ? "true" : "false";
  process.env.AUDIT_TXT_INGEST = txtIngest ? "true" : "false";
  const ctx = mkCtx(section, text);
  const findings: TypedFinding[] = []; // no finding cites this section → valve path
  const sectionsRead = new Set<string>([section]);
  const { covered, missing, attestations } = completenessOf(ctx, [section], findings, sectionsRead);
  const att = attestations.find((a: SectionAttestation) => a.section === section);
  const coverageComplete = missing.length === 0; // section leg of orchestrator:2030
  const decision = deriveVerdict({
    findings: [], bidderProfile: null, coverageComplete, verifierSound: true, conflict: false,
  });
  const overfire = att?.status === "obligations_ungrounded";
  console.log(
    `${label.padEnd(26)} floor=${garbleFloor ? "ON " : "OFF"} ingest=${txtIngest ? "on " : "off"} ` +
    `status=${(att?.status ?? "?").padEnd(22)} covered=${covered.length} missing=${missing.length} ` +
    `→ verdict=${decision.verdict.padEnd(18)} ${overfire ? "*** OVER-FIRE → NHR/INCOMPLETE ***" : ""}`
  );
}

console.log("=== Production composition: completenessOf → coverageComplete → deriveVerdict ===\n");
console.log("BASELINE (flag OFF) must be read_no_obligation/covered/BID-class for ALL:");
for (const ingest of [false, true]) {
  runOne("WAGE table", "B", WAGE_TABLE, false, ingest);
  runOne("CLIN grid", "B", CLIN_GRID, false, ingest);
}
console.log("\nFLOOR ON — clean tables MUST still get the valve (any INCOMPLETE = over-fire):");
for (const ingest of [false, true]) {
  runOne("WAGE table", "B", WAGE_TABLE, true, ingest);
  runOne("CLIN grid", "B", CLIN_GRID, true, ingest);
}
