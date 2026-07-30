/**
 * R2 — PRODUCTION-COMPOSITION probe. Drives the REAL coverage path
 *   completenessOf → missing[] → coverageComplete → deriveVerdict
 * for the R2 candidates, to prove which flip a section to INCOMPLETE end-to-end.
 * Baseline (flag OFF) must be read_no_obligation/covered/BID for every candidate;
 * FLOOR ON, any INCOMPLETE on CLEAN text = over-fire.
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

function mkCtx(section: string, text: string): AuditToolContext {
  return { fullSource: text, sections: { [section]: text } } as AuditToolContext;
}

function runOne(label: string, section: string, text: string, floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  process.env.AUDIT_TXT_INGEST = "true";
  const ctx = mkCtx(section, text);
  const findings: TypedFinding[] = [];
  const sectionsRead = new Set<string>([section]);
  const { covered, missing, attestations } = completenessOf(ctx, [section], findings, sectionsRead);
  const att = attestations.find((a: SectionAttestation) => a.section === section);
  const coverageComplete = missing.length === 0;
  const decision = deriveVerdict({ findings: [], bidderProfile: null, coverageComplete, verifierSound: true, conflict: false } as any);
  const overfire = att?.status === "obligations_ungrounded";
  console.log(
    `${label.padEnd(30)} floor=${floor?"ON ":"OFF"} status=${(att?.status ?? "?").padEnd(22)} ` +
    `missing=${missing.length} → verdict=${decision.verdict.padEnd(18)} ${overfire?"*** FLOORED → INCOMPLETE ***":""}`
  );
}

const CJK_LONG = `附件 J — 工作说明书翻译件（仅供参考）
承包商应按照本合同的所有条款和条件提供全部服务与物资。工作范围包括但不限于以下各
项内容：项目管理、技术支持、现场维护、人员培训、文档编制以及质量保证。所有交付物
均应符合合同规定的质量标准，并在约定的时间内按时提交给政府代表进行审查和验收。承
包商应指派一名具备相应资质的项目经理，全面负责日常的协调、沟通与进度管理工作。政
府保留对任何交付成果进行审查的权利，并可在认为必要时要求承包商进行修改或补充。所
有款项应在政府正式验收合格之后的三十个日历日内予以支付。本翻译件仅供参考之用，如
与英文正本存在任何歧义或不一致之处，一律以英文正本的内容为最终准据。承包商还应遵
守所有适用的联邦、州以及地方的法律法规和相关规定。`;

const ARABIC = `الملحق ي — ترجمة بيان العمل
يجب على المقاول أن يقدم جميع الخدمات والمواد وفقًا لجميع شروط وأحكام هذا العقد. يشمل
نطاق العمل على سبيل المثال لا الحصر ما يلي: إدارة المشروع والدعم الفني والصيانة الميدانية
وتدريب الموظفين وإعداد الوثائق وضمان الجودة. يجب أن تتوافق جميع المخرجات مع معايير
الجودة المحددة في العقد وأن تُقدَّم في الوقت المحدد إلى ممثل الحكومة للمراجعة والقبول.`;

// The realistic CLEAN symbol/diacritic sections that must STAY covered (R1 posture holds).
const MATH_SPEC = `SECTION C — TECHNICAL SPECIFICATIONS
The contractor shall furnish assemblies meeting the following:
Operating temperature: −40 °C to +85 °C (±2 °C). Torque: 12 N·m ± 0.5 N·m.
Coil resistance: 4 Ω ± 5 %. Insulation ≥ 100 MΩ. Flow: 3.2 m³/h ± 0.1 m³/h.
Pressure ≤ 6 bar, ≥ 2 bar. Area: 12.5 m² ± 0.2 m². Diameter: Ø 25 mm ± 0.05 mm.
Density: 7.85 g/cm³. Frequency: 50 Hz ± 1 %. Voltage: 230 V ± 10 %. Efficiency ≥ 92 %.
Wavelength λ = 632.8 nm. Cost cap: €1,250 / £980 / ¥135,000. © 2026 Agency. 5 µm ± 1 µm.`;
const DIACRITIC = `SECTION J — PERSONNEL AND PLACE OF PERFORMANCE
Key personnel: José Muñoz, François Béringer, Nguyễn Thị Hương, Björn Ståhl, Zoë Çelik,
André Lefèvre, Håkon Sørensen, Mónica Peña, Iñaki Uribe, Søren Kjær, Łukasz Wójcik.
Places: München, Zürich, Córdoba, São Paulo, Reykjavík, Tromsø, Kraków, Gdańsk, Łódź,
Košice, Čačak, Đà Nẵng, Đồng Hới, Buôn Ma Thuột. Résumé and curriculum vitæ required.`;

console.log("=== R2 production composition ===\n");
console.log("BASELINE flag OFF — all covered/BID:");
for (const [l, t] of [["CJK_LONG", CJK_LONG], ["ARABIC", ARABIC], ["MATH_SPEC", MATH_SPEC], ["DIACRITIC", DIACRITIC]] as const)
  runOne(l, "J", t, false);
console.log("\nFLOOR ON — any INCOMPLETE on clean text = over-fire:");
for (const [l, t] of [["CJK_LONG", CJK_LONG], ["ARABIC", ARABIC], ["MATH_SPEC", MATH_SPEC], ["DIACRITIC", DIACRITIC]] as const)
  runOne(l, "J", t, true);
