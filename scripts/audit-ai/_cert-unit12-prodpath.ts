/**
 * CERT — PRODUCTION-COMPOSITION proof of the box-drawing / dot-leader over-fire.
 * Real completenessOf → missing[] → coverageComplete → deriveVerdict.
 * Baseline (flag OFF) must be read_no_obligation/covered/BID.
 * FLOOR ON: any INCOMPLETE on a CLEAN ruled-table / dot-leader section = OVER-FIRE, end-to-end.
 * Every candidate is obligation-verb-free (verified) so it lands on the read_no_obligation valve.
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

const OBLIG = /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i;

function mkCtx(section: string, text: string): AuditToolContext {
  return { fullSource: text, sections: { [section]: text } } as AuditToolContext;
}
function runOne(label: string, section: string, text: string, floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  process.env.AUDIT_TXT_INGEST = "true";
  const ctx = mkCtx(section, text);
  const findings: TypedFinding[] = [];
  const sectionsRead = new Set<string>([section]);
  const { missing, attestations } = completenessOf(ctx, [section], findings, sectionsRead);
  const att = attestations.find((a: SectionAttestation) => a.section === section);
  const coverageComplete = missing.length === 0;
  const decision = deriveVerdict({ findings: [], bidderProfile: null, coverageComplete, verifierSound: true, conflict: false } as any);
  const overfire = floor && att?.status === "obligations_ungrounded";
  console.log(
    `${label.padEnd(28)} floor=${floor?"ON ":"OFF"} oblig=${OBLIG.test(text)?"Y":"n"} status=${(att?.status ?? "?").padEnd(22)} ` +
    `missing=${missing.length} verdict=${decision.verdict.padEnd(18)} ${overfire?"*** OVER-FIRE: clean → INCOMPLETE ***":""}`
  );
}

// D — ruled org/staffing table, prose cells, full borders. Realistic pdftotext -layout output.
const RULED_TABLE = `SECTION J ORGANIZATION AND STAFFING PLAN\n┌────────────────────────────────────────────┬──────────────────┐\n` +
  Array.from({length:12},(_,i)=>`│ Task Area ${i+1}: Program Management Coordination Support │ Lead: Jane Smith │\n├────────────────────────────────────────────┼──────────────────┤`).join("\n") +
  `\n└────────────────────────────────────────────┴──────────────────┘`;

// E — dot-leader Table of Contents. Extremely common -layout artifact.
const DOT_LEADER_TOC = `TABLE OF CONTENTS\n` +
  Array.from({length:26},(_,i)=>`Section ${i+1} — Statement of Work and Related Attachments ${'·'.repeat(40)} ${i+3}`).join("\n");

// B — CLIN price grid, short numeric cells, ruled borders.
const PRICE_GRID = `SECTION B PRICE SCHEDULE\n┌──────┬────────┬────────┐\n` +
  Array.from({length:20},(_,i)=>`│ ${1000+i} │ 12.50 │ 250.00 │\n├──────┼────────┼────────┤`).join("\n") + `\n└──────┴────────┴────────┘`;

console.log("=== CERT production composition: box-drawing / dot-leader over-fire ===\n");
console.log("BASELINE flag OFF — all must be read_no_obligation → BID:");
runOne("RULED_TABLE (org/staffing)", "J", RULED_TABLE, false);
runOne("DOT_LEADER_TOC", "J", DOT_LEADER_TOC, false);
runOne("PRICE_GRID (CLIN)", "B", PRICE_GRID, false);

console.log("\nFLOOR ON — any INCOMPLETE on these CLEAN sections = OVER-FIRE:");
runOne("RULED_TABLE (org/staffing)", "J", RULED_TABLE, true);
runOne("DOT_LEADER_TOC", "J", DOT_LEADER_TOC, true);
runOne("PRICE_GRID (CLIN)", "B", PRICE_GRID, true);
