/**
 * CERT — prove the POLE moves BID → INCOMPLETE on the box-drawing over-fire.
 * Two sections: a real §M with a grounded finding (keeps a committal posture),
 * plus the clean ruled-table §J on the valve path. Floor OFF ⇒ §J covered ⇒ BID.
 * Floor ON ⇒ §J floors ⇒ missing ⇒ INCOMPLETE. Clean section drove the flip.
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

const M_TEXT = `SECTION M EVALUATION FACTORS\nThe Government will evaluate proposals on price and technical acceptability under LPTA.`;
const RULED_TABLE_J = `SECTION J ORGANIZATION AND STAFFING PLAN\n┌────────────────────────────────────────────┬──────────────────┐\n` +
  Array.from({length:12},(_,i)=>`│ Task Area ${i+1}: Program Management Coordination Support │ Lead: Jane Smith │\n├────────────────────────────────────────────┼──────────────────┤`).join("\n") +
  `\n└────────────────────────────────────────────┴──────────────────┘`;

const full = `${M_TEXT}\n\n${RULED_TABLE_J}`;
const ctx = { fullSource: full, sections: { M: M_TEXT, J: RULED_TABLE_J } } as AuditToolContext;
// A grounded finding cited to §M whose excerpt is in §M — makes §M covered_direct.
const findings: TypedFinding[] = [{
  id: "f1", citation: "§M", excerpt: "The Government will evaluate proposals on price and technical acceptability under LPTA.",
  importance: "informational",
} as unknown as TypedFinding];

function run(floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  process.env.AUDIT_TXT_INGEST = "true";
  const sectionsRead = new Set<string>(["M", "J"]);
  const { covered, missing, attestations } = completenessOf(ctx, ["M", "J"], findings, sectionsRead);
  const decision = deriveVerdict({ findings, bidderProfile: null, coverageComplete: missing.length === 0, verifierSound: true, conflict: false } as any);
  const jStatus = attestations.find((a: SectionAttestation) => a.section === "J")?.status;
  console.log(`floor=${floor?"ON ":"OFF"} covered=[${covered.join(",")}] missing=[${missing.join(",")}] §J=${(jStatus??"?").padEnd(22)} verdict=${decision.verdict}`);
}

console.log("=== CERT pole-flip: clean ruled-table §J drives BID → INCOMPLETE ===\n");
run(false);
run(true);
