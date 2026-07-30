/**
 * RED-TEAM Unit #12 R2 — DISCRIMINATOR-level probe on looksMojibake.
 * Hunts the NEW axis (post-R1): arm (A) hard-corruption density ≥2%, arm (B) non-ASCII ≥30%.
 * Reports per-candidate: nonWs len, hard%, nonAscii%, and which arm (if any) fires.
 * Focus on CLEAN text that trips arm (B) [symbol/math specs, diacritics, smart-punct,
 * non-Latin scripts] and any clean text that legitimately carries arm-(A) chars.
 */
import { looksMojibake } from "../../src/lib/pdf-ocr";

function metrics(text: string) {
  const chars = [...(text ?? "").replace(/\s+/g, "")];
  let hard = 0, nonAscii = 0;
  for (const ch of chars) {
    const c = ch.codePointAt(0)!;
    if (c > 0x7e) { nonAscii++; if ((c >= 0x80 && c <= 0x9f) || c === 0xfffd) hard++; }
    else if (c < 0x20 && c !== 0x09) { hard++; nonAscii++; }
  }
  return { len: chars.length, hard, nonAscii, hardPct: hard / chars.length, naPct: nonAscii / chars.length };
}

function report(label: string, text: string) {
  const m = metrics(text);
  const fired = looksMojibake(text);
  const armA = m.hardPct >= 0.02;
  const armB = m.naPct >= 0.30;
  const tag = fired ? (armA && armB ? "A+B" : armA ? "A" : "B") : "-";
  console.log(
    `${label.padEnd(34)} len=${String(m.len).padStart(4)} hard=${(m.hardPct * 100).toFixed(2).padStart(6)}% ` +
    `nonAscii=${(m.naPct * 100).toFixed(2).padStart(6)}% floor=${fired ? "FLOOR" : "ok   "} arm=${tag}`
  );
  return { fired, ...m };
}

console.log("=== R2 discriminator: looksMojibake on CLEAN unusual sections ===\n");

// --- Candidate 1: symbol/math/engineering spec (§C technical). CLEAN, human-written. ---
// Realistic: a mechanical/electrical spec section with units and tolerances.
const MATH_SPEC = `SECTION C — TECHNICAL SPECIFICATIONS
The contractor shall furnish assemblies meeting the following:
Operating temperature: −40 °C to +85 °C (±2 °C).
Torque: 12 N·m ± 0.5 N·m. Angular tolerance: ±0.5°.
Coil resistance: 4 Ω ± 5 %. Insulation ≥ 100 MΩ.
Flow rate: 3.2 m³/h ± 0.1 m³/h. Pressure ≤ 6 bar, ≥ 2 bar.
Area: 12.5 m² ± 0.2 m². Volume ≈ 0.75 m³.
Diameter: Ø 25 mm ± 0.05 mm. Density: 7.85 g/cm³.
Frequency: 50 Hz ± 1 %. Voltage: 230 V ± 10 %.
Efficiency: ≥ 92 %. Thermal expansion: 11 × 10⁻⁶ /°C.
Wavelength: λ = 632.8 nm. Charge: 1.6 × 10⁻¹⁹ C.
Cost cap: €1,250 / £980 / ¥135,000. © 2026 Agency.
Half-life: ½ cycle. Root: √2 ≈ 1.414. Micro: 5 µm ± 1 µm.`;

// --- Candidate 2: diacritic/accent-heavy CLEAN text (bilingual/personnel/place names). ---
const DIACRITIC = `SECTION J — PERSONNEL AND PLACE OF PERFORMANCE
Key personnel: José Muñoz, François Béringer, Nguyễn Thị Hương, Björn Ståhl,
Zoë Çelik, André Lefèvre, Renée Dubçek, Håkon Sørensen, Mónica Peña,
Iñaki Uribe, Søren Kjær, Łukasz Wójcik, Émile Thibodeau, Ædán Ó Faoláin.
Places of performance: Kǎbul, Ḩadīthah, Al-Fallūjah, München, Zürich,
Córdoba, São Paulo, Reykjavík, Þórshöfn, Tromsø, Kraków, Gdańsk, Łódź,
Košice, Bratislava, Čačak, Đà Nẵng, Đồng Hới, Buôn Ma Thuột, Pleiku.
Résumé and curriculum vitæ required for each. Naïve estimates rejected.
Café and cafeteria services per attaché schedule. Coördinate via liaison.`;

// --- Candidate 3: smart-punctuation-dense CLEAN typeset prose. ---
const SMARTPUNCT = `SECTION H — SPECIAL CONTRACT REQUIREMENTS
The Government's position — as stated in the pre‑proposal conference —
is that the offeror's "best value" tradeoff shall govern. The following
apply: • timeliness; • quality; • past performance… all weighted equally.
"Deliverables" means the items in Attachment 1 – Attachment 7. The period
of performance runs 1 October 2026 – 30 September 2027 (the "base year").
§ 52.217‑8 applies. The contractor's staff — including subcontractors' —
shall comply. Note: the "option" years (§ H.4) are unilateral… The KO's
determination is final. Rates: $85/hr — $145/hr. See ¶ 3.2.1 – ¶ 3.2.9.`;

// --- Candidate 4: genuinely non-Latin CLEAN script (translated attachment). ---
const NONLATIN = `附件 J — 工作说明书翻译件
承包商应按照本合同的要求提供所有服务和物资。工作范围包括但不限于以下各项：
项目管理、技术支持、现场维护、培训服务以及文档编制。所有交付物应符合规定的
质量标准并按时提交。承包商应指派一名合格的项目经理负责日常协调工作。
政府将对交付成果进行审查并在必要时要求修改。付款应在验收合格后三十天内完成。
本翻译件仅供参考，如有歧义以英文正本为准。承包商应遵守所有适用的法律法规。`;

report("MATH_SPEC (clean §C tech)", MATH_SPEC);
report("DIACRITIC (clean §J names)", DIACRITIC);
report("SMARTPUNCT (clean §H typeset)", SMARTPUNCT);
report("NONLATIN (clean CJK attach)", NONLATIN);

// --- Candidate 5: arm-(A) legit control chars? BOM + stray form-feeds from real extraction. ---
// PDF extractors sometimes emit U+000C (form feed, C0 control, NOT tab) at page breaks,
// and a leading U+FEFF BOM. Both are C0/non-ASCII. Build a clean section peppered with them.
const FF = "\f"; // U+000C form feed — C0 control, counts as hard
const BOM = "﻿";
const cleanBody = `This section describes the ordering procedures for the indefinite delivery contract. The Government may issue task orders at any time during the ordering period. Each task order will specify the required services and delivery schedule. `;
// Simulate a page-break-heavy extraction: form feed every ~40 chars.
let ffHeavy = BOM;
for (let i = 0; i < cleanBody.length; i++) {
  ffHeavy += cleanBody[i];
  if (i % 40 === 39) ffHeavy += FF; // page/column break artifact
}
report("FF_HEAVY (formfeeds+BOM)", ffHeavy);

// Just a couple of form feeds in a long clean section (realistic multi-page section).
const fewFF = BOM + cleanBody.repeat(3).replace(/\. /g, ".\f ");
report("FEW_FF (BOM + page breaks)", fewFF);

console.log("\n=== Boundary math ===");
// Exactly 30% non-ASCII at exactly 300 non-ws chars.
const na = "é".repeat(90); const asc = "a".repeat(210);
report("EXACT 30% naPct @300", na + asc);
// Just under: 89 non-ascii of 300 = 29.67%
report("29.67% naPct @300", "é".repeat(89) + "a".repeat(211));
// Exactly 2% hard @300 = 6 hard chars.
const C1 = String.fromCodePoint(0x80);
report("EXACT 2% hard @300", C1.repeat(6) + "a".repeat(294)); //"".repeat(6) + "a".repeat(294));
report("1.67% hard @300 (5 chars)", C1.repeat(5) + "a".repeat(295)); //"".repeat(5) + "a".repeat(295));
