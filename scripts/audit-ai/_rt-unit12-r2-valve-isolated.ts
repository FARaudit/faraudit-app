/**
 * R2 — VALVE-ISOLATED. The prodpath run showed MATH_SPEC/DIACRITIC took the ungrounded
 * path (they contain English "shall/required" verbs) so they never reached the garble
 * floor. To test the FLOOR itself on clean symbol/diacritic text, strip obligation verbs
 * so obligationsOf()===[] → the valve → the floor. These VERB-LESS symbol/diacritic
 * sections must stay read_no_obligation/covered under the floor (they are <30% non-ASCII).
 * The non-Latin sections (≈100% non-ASCII) are the ones that flip.
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

function runOne(label: string, text: string, floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  process.env.AUDIT_TXT_INGEST = "true";
  const ctx = { fullSource: text, sections: { J: text } } as AuditToolContext;
  const findings: TypedFinding[] = [];
  const { covered, missing, attestations } = completenessOf(ctx, ["J"], findings, new Set(["J"]));
  const att = attestations.find((a: SectionAttestation) => a.section === "J");
  const coverageComplete = missing.length === 0;
  const d = deriveVerdict({ findings: [], bidderProfile: null, coverageComplete, verifierSound: true, conflict: false } as any);
  console.log(`${label.padEnd(30)} floor=${floor?"ON ":"OFF"} status=${(att?.status ?? "?").padEnd(22)} → ${d.verdict}`);
}

// VERB-LESS clean symbol section (a spec DATA sheet — no shall/must/provide/required).
const MATH_DATA = `SECTION C DATA SHEET — NOMINAL VALUES (reference only)
Operating temperature: −40 °C … +85 °C (±2 °C). Torque: 12 N·m ± 0.5 N·m.
Coil resistance: 4 Ω ± 5 %. Insulation: ≥ 100 MΩ. Flow: 3.2 m³/h ± 0.1 m³/h.
Pressure: ≤ 6 bar, ≥ 2 bar. Area: 12.5 m² ± 0.2 m². Diameter: Ø 25 mm ± 0.05 mm.
Density: 7.85 g/cm³. Frequency: 50 Hz ± 1 %. Voltage: 230 V ± 10 %. Efficiency: ≥ 92 %.
Wavelength: λ = 632.8 nm. Cost cap: €1,250 / £980 / ¥135,000. © 2026 Agency. 5 µm ± 1 µm.
Half-life: ½ cycle. √2 ≈ 1.414. Angles: 30° / 45° / 90°. Ratio: ¾ vs ⅔.`;

// VERB-LESS clean diacritic section (a roster — names/places only).
const DIACRITIC_DATA = `SECTION J ROSTER — KEY PERSONNEL AND PLACES (reference list)
José Muñoz; François Béringer; Nguyễn Thị Hương; Björn Ståhl; Zoë Çelik;
André Lefèvre; Håkon Sørensen; Mónica Peña; Iñaki Uribe; Søren Kjær; Łukasz Wójcik;
Émile Thibodeau; Ædán Ó Faoláin; Renée Dubçek; Þórður Guðmundsson; Óscar Peña.
München; Zürich; Córdoba; São Paulo; Reykjavík; Tromsø; Kraków; Gdańsk; Łódź;
Košice; Čačak; Đà Nẵng; Đồng Hới; Buôn Ma Thuột; Þórshöfn; Ḩadīthah; Córdoba.`;

const CJK_LONG = `附件 J — 工作说明书翻译件（仅供参考）
承包商应按照本合同的所有条款和条件提供全部服务与物资。工作范围包括但不限于以下各
项内容：项目管理、技术支持、现场维护、人员培训、文档编制以及质量保证。所有交付物
均应符合合同规定的质量标准，并在约定的时间内按时提交给政府代表进行审查和验收。承
包商应指派一名具备相应资质的项目经理，全面负责日常的协调、沟通与进度管理工作。政
府保留对任何交付成果进行审查的权利，并可在认为必要时要求承包商进行修改或补充。所
有款项应在政府正式验收合格之后的三十个日历日内予以支付。本翻译件仅供参考之用。`;

console.log("=== R2 valve-isolated (verb-less → the floor is the only actor) ===\n");
console.log("VERB-LESS clean symbol/diacritic MUST stay covered under the floor:");
runOne("MATH_DATA (verb-less)", MATH_DATA, false);
runOne("MATH_DATA (verb-less)", MATH_DATA, true);
runOne("DIACRITIC_DATA (verb-less)", DIACRITIC_DATA, false);
runOne("DIACRITIC_DATA (verb-less)", DIACRITIC_DATA, true);
console.log("\nNon-Latin (≈100% non-ASCII) — the flip:");
runOne("CJK_LONG", CJK_LONG, false);
runOne("CJK_LONG", CJK_LONG, true);
