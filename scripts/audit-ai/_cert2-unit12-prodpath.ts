/**
 * CERT-2 Unit #12 — PRODUCTION-COMPOSITION over-fire hunt.
 * Drives REALISTIC clean-but-unusual sections (imperial-fraction hardware schedule,
 * multi-currency price table, checkbox reps&certs, math/tolerance spec) through the REAL
 * coverage path:  completenessOf → coverageComplete → deriveVerdict.
 * A clean section that lands obligations_ungrounded / INCOMPLETE = OVER-FIRE (P0/P1).
 * Nothing in the coverage logic is stubbed; findings=[] so obligationsOf()===[] → valve path.
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

// 16-row realistic imperial hardware schedule — full part descriptions, sizes, qty preserved.
const IMPERIAL = [
'Hex bolt grade 5 ¼-20 × ¾ steel zinc 120',
'Flat washer ½ ID SAE 240 pieces',
'Lock washer split ⅜ hardened 120',
'Machine screw pan head ⅜-16 × ¾ 080',
'Wing nut brass ¼-20 060 units',
'Spacer nylon ⅝ OD ⅜ ID 090',
'Threaded rod zinc ¾ × 36 015',
'Cotter pin stainless ⅛ × 1½ 200',
'Shoulder screw alloy ½ × ⅞ 045',
'Clevis pin plated ⅜ × 1¼ 075',
'Retaining ring external ¾ 150',
'Dowel pin hardened ¼ × ⅝ 110',
'Set screw cup point ⅜ × ½ 065',
'Carriage bolt ¾-10 × 4 galvanized 030',
'Fender washer ¼ large OD 180',
'Hex nut nylock ⅜-16 zinc 095',
].join('\n');

const CURRENCY = `PRICING SCHEDULE — MULTI-CURRENCY LINE ITEMS
Item 001 Widget assembly €12,500.00 £10,200.00 ¥1,850,000 $13,400.00
Item 002 Control module €8,750.50 £7,140.00 ¥1,295,000 $9,380.00
Item 003 Power supply €22,300.00 £18,200.00 ¥3,300,000 $23,900.00
Item 004 Cable harness €5,600.00 £4,570.00 ¥829,000 $6,000.00
Item 005 Chassis frame €31,450.75 £25,680.00 ¥4,655,000 $33,700.00
Item 006 Cooling fan €14,200.00 £11,590.00 ¥2,101,000 $15,200.00
TOTAL €94,801.25 £77,380.00 ¥14,030,000 $101,580.00`;

const CHECKBOX = `REPRESENTATIONS AND CERTIFICATIONS
☒ (a) The offeror represents it IS a small business concern.
☐ (b) The offeror represents it is NOT a small business concern.
☒ (c) The offeror is a woman-owned small business WOSB.
☐ (d) The offeror is a HUBZone small business concern.
☒ (e) The offeror is a service-disabled veteran-owned small business.
☐ (f) The offeror is an 8(a) participant.
☒ (g) The offeror has completed the annual representations at SAM.gov.
☐ (h) The offeror is a foreign concern.
☒ (i) The offeror certifies compliance with FAR 52.209-5.`;

const MATHSPEC = `5.4 TOLERANCES. Unless otherwise specified, all machined dimensions shall be held to ± 0.005 in. Angular tolerances shall be ± 0.5° from nominal. Surface finish shall be ≤ 63 µin Ra on mating faces. Bore concentricity shall be ≤ 0.002 in TIR. Flatness shall be ≤ 0.010 in over any 12 in span. Perpendicularity shall be ≤ 0.5° relative to datum A. Operating temperature shall range from −20 °C to +60 °C. Coating thickness 25 ± 5 µm. Hardness shall be ≥ 45 HRC. Weld throat shall be ≥ ⅜ in. Bolt torque shall be 30 ± 3 ft·lb. Pressure rating shall be ≤ 150 psi at 70 °F.`;

function mkCtx(section: string, text: string): AuditToolContext {
  return { fullSource: text, sections: { [section]: text } } as AuditToolContext;
}
function runOne(label: string, text: string, floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  const section = "C";
  const ctx = mkCtx(section, text);
  const findings: TypedFinding[] = [];
  const sectionsRead = new Set<string>([section]);
  const { covered, missing, attestations } = completenessOf(ctx, [section], findings, sectionsRead);
  const att = attestations.find((a: SectionAttestation) => a.section === section);
  const coverageComplete = missing.length === 0;
  const decision = deriveVerdict({
    findings: [], bidderProfile: null, coverageComplete, verifierSound: true, conflict: false,
  } as Parameters<typeof deriveVerdict>[0]);
  const overfire = att?.status === "obligations_ungrounded";
  console.log(
    `${label.padEnd(20)} floor=${floor ? "ON " : "OFF"} status=${(att?.status ?? "?").padEnd(24)} ` +
    `covered=${covered.length} missing=${missing.length} verdict=${decision.verdict.padEnd(16)} ` +
    `${overfire ? "*** OVER-FIRE ***" : ""}`
  );
}

console.log("=== CERT-2 realistic clean sections through production coverage path ===\n");
for (const floor of [false, true]) {
  runOne("Imperial hardware", IMPERIAL, floor);
  runOne("Multi-currency tbl", CURRENCY, floor);
  runOne("Checkbox reps/cert", CHECKBOX, floor);
  runOne("Math/tolerance spec", MATHSPEC, floor);
}
console.log("\nANY 'OVER-FIRE' above with floor=ON = DISSENT.");
