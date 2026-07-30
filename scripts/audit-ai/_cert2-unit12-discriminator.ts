/** CERT-2 Unit #12 — discriminator regression: prior classes closed + boundary math + determinism. */
import { looksMojibake } from "../../src/lib/pdf-ocr";

let fails = 0;
function T(label: string, txt: string, expect: boolean) {
  const r = looksMojibake(txt);
  const ok = r === expect;
  if (!ok) fails++;
  console.log(`${(ok ? "PASS" : "*** FAIL").padEnd(9)} ${label.padEnd(30)} floor=${r} expect=${expect}`);
}

// ---- R1 clean structured (no symbols) ----
T("R1 wage", ("Project Manager 145.00 1920 278400 Senior Analyst 112.50 1920 216000 Junior Analyst 88.00 960 84480 Admin 55.00 960 52800 SME 175.00 480 84000 ").repeat(3), false);
T("R1 CLIN", ("CLIN 0001 Base FFP 1 LOT CLIN 0002 OY1 FFP 1 LOT CLIN 1001 ODC TM 1 LOT CLIN 2001 OY2 FFP 1 LOT ").repeat(4), false);
T("R1 clause list", ("52.204-7 52.209-5 52.212-1 52.212-3 52.212-4 52.219-6 52.222-21 52.225-13 52.232-33 52.233-3 52.247-34 ").repeat(4), false);
T("R1 acronyms", ("SOW PWS QASP CDRL DFARS FAR NAICS PSC CLIN ODC NTE FFP IDIQ BPA GSA MAS OASIS SEWP GWAC ").repeat(4), false);

// ---- R2 coherent non-Latin ----
T("R2 Vietnamese", ("Nhà thầu phải cung cấp dịch vụ theo yêu cầu của hợp đồng. Nguyễn Thị Hương và Trần Văn Bình phụ trách. ").repeat(4), false);
T("R2 Cyrillic", ("Подрядчик должен предоставить услуги в соответствии с требованиями контракта в установленные сроки поставки. ").repeat(4), false);
T("R2 bilingual", ("The contractor shall provide services. 承包商应当按照合同要求提供服务并遵守所有适用的法律法规和标准要求。 ").repeat(4), false);

// ---- cert-1 layout ----
T("cert-1 box-drawing", ("┌────────────┬──────────┐ │ Item │ Price │ ├────────────┼──────────┤ │ Widget A │ 1200.00 │ │ Widget B │ 2400.00 │ └────────────┴──────────┘ ").repeat(3), false);
T("cert-1 dot-leader", ("1 INTRODUCTION ............................ 1 2 SCOPE ................................... 4 3 REQUIREMENTS ........................... 12 ").repeat(4), false);
T("cert-1 bullets/dash", ("• contractor shall provide staff • maintain records • submit reports — Section A base — Section B options ").repeat(4), false);
T("cert-1 arrows", ("Phase 1 → Phase 2 → Phase 3 → Delivery. Input → Process → Output → Review → Approval → Close. ").repeat(5), false);
T("cert-1 curly/section", ("The contractor’s obligation is “clear” and the Government’s intent is ‘firm’ — see §12.3 ¶ 4 · item. ").repeat(5), false);

// ---- Realistic clean unusual sections (the CERT-2 hunt) ----
T("imperial hardware", ["Hex bolt grade 5 ¼-20 × ¾ steel zinc 120","Flat washer ½ ID SAE 240 pieces","Lock washer split ⅜ hardened 120","Machine screw pan head ⅜-16 × ¾ 080","Wing nut brass ¼-20 060 units","Spacer nylon ⅝ OD ⅜ ID 090","Threaded rod zinc ¾ × 36 015","Cotter pin stainless ⅛ × 1½ 200","Shoulder screw alloy ½ × ⅞ 045","Clevis pin plated ⅜ × 1¼ 075","Retaining ring external ¾ 150","Dowel pin hardened ¼ × ⅝ 110","Set screw cup point ⅜ × ½ 065","Carriage bolt ¾-10 × 4 galvanized 030","Fender washer ¼ large OD 180","Hex nut nylock ⅜-16 zinc 095"].join("\n"), false);
T("multi-currency table", ("Item Widget assembly €12,500.00 £10,200.00 ¥1,850,000 $13,400.00 Control module €8,750.50 £7,140.00 ¥1,295,000 $9,380.00 Power supply €22,300.00 £18,200.00 ¥3,300,000 $23,900.00 ").repeat(2), false);
T("checkbox reps/cert", ["☒ (a) The offeror represents it IS a small business concern.","☐ (b) The offeror represents it is NOT a small business concern.","☒ (c) The offeror is a woman-owned small business WOSB.","☐ (d) The offeror is a HUBZone small business concern.","☒ (e) The offeror is a service-disabled veteran-owned small business.","☐ (f) The offeror is an 8(a) participant.","☒ (g) The offeror has completed the annual representations at SAM.gov.","☐ (h) The offeror is a foreign concern."].join("\n"), false);
T("temperature/angle deg", ("Operating range −40 °C to +85 °C at 15 ° incline; ambient 20 °C nominal; storage −55 °C to +125 °C; slope ≤ 30 ° max angle across all mounting orientations of the assembly. ").repeat(3), false);

// ---- TRUE POSITIVES ----
T("TRUE+ C1/FFFD salad", ("\x81\x8d\x90\x9d��\x81\x8d normal text but control chars sprinkled through it ").repeat(6), true);
// Dense font-dump salad (≥25% non-letter Latin-1/misc symbols, minimal ASCII glue) — genuine mojibake.
T("TRUE+ Latin1 sym salad", ("Â¬Ã¾Æ¢Ø¡™½¾¿×÷≤≥±¢£¥¤¦§¨©ª«¬®¯°±²³ dump ").repeat(8), true);
// Under-fire SANCTIONED: homoglyph salad that stays mostly clean ASCII letters (<25%) → SAFE stays covered.
T("under-fire homoglyph<25%", ("Â¬Ã¾ Ã† Â¢Ã˜Â¡â„¢ Ã©Ã¨Ã« garbled font dump text here readable ").repeat(6), false);

// ---- Boundary math ----
T("boundary <300 (299)", "x".repeat(299), false);                                  // below floor → never judged
T("boundary =300 clean", "x".repeat(300), false);                                  // at floor, clean
// hard exactly at 2%: 6 C1 chars in 300 = 2.0% → floors
T("boundary hard =2.0%", "\x81".repeat(6) + "x".repeat(294), true);
T("boundary hard =1.67%", "\x81".repeat(5) + "x".repeat(295), false);              // 5/300 = 1.67% → no
// sym exactly at 25%: 75 symbols in 300 = 25% → floors
T("boundary sym =25.0%", "¢".repeat(75) + "x".repeat(225), true);
T("boundary sym =24.7%", "¢".repeat(74) + "x".repeat(226), false);                 // 74/300 = 24.67% → no

// ---- Determinism ----
const sample = ("Â¬Ã¾ Ã† Â¢Ã˜Â¡â„¢ Â½Â¾Â¿ Ã—Ã· â‰¤â‰¥ garbled ").repeat(10);
const runs = new Set([looksMojibake(sample), looksMojibake(sample), looksMojibake(sample)]);
console.log(runs.size === 1 ? "PASS      determinism (3 identical runs)" : "*** FAIL determinism");
if (runs.size !== 1) fails++;

console.log(`\n${fails === 0 ? "ALL GREEN" : "*** " + fails + " FAILURES"}`);
process.exit(fails === 0 ? 0 : 1);
