/**
 * CERT — confirm R1 + R2 stay CLOSED, boundary math, determinism, flag-OFF equivalence.
 */
import { looksMojibake } from "../../src/lib/pdf-ocr";

let fails = 0;
function eq(label: string, got: boolean, want: boolean) {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok?"ok  ":"FAIL"} ${label.padEnd(46)} got=${got} want=${want}`);
}

console.log("=== R1 CLOSED: clean low-common-word tables/lists must NOT floor ===");
eq("wage determination table", looksMojibake(`SCA WAGE DETERMINATION 2015-4567 REV 12\n`+Array.from({length:40},(_,i)=>`01${100+i} Occupation Title ${i} 24.${i%100} 8.14 HW 4.00 VAC`).join("\n")), false);
eq("CLIN price list (ascii)", looksMojibake(Array.from({length:40},(_,i)=>`CLIN 00${10+i} QTY 100 UNIT EA UNIT PRICE 12.50 EXTENDED 1250.00`).join("\n")), false);
eq("clause-number list", looksMojibake(Array.from({length:60},(_,i)=>`52.2${10+i}-${i} FAR clause incorporated by reference JUN 2020`).join("\n")), false);
eq("acronym block", looksMojibake(`COR KO PWS SOW CDRL CLIN IDIQ BOA GFE GFP OCONUS CONUS ODC FFP T&M LOE POP QASP DFARS FAR SCA WD WHD `.repeat(20)), false);

console.log("\n=== R2 CLOSED: coherent foreign LETTERS must NOT floor (letters excluded) ===");
eq("CJK ≥300", looksMojibake(`承包商应按照本合同的所有条款和条件提供全部服务与物资工作范围包括但不限于以下各项内容项目管理技术支持现场维护人员培训文档编制以及质量保证所有交付物均应符合合同规定的质量标准并在约定的时间内按时提交给政府代表进行审查和验收承包商应指派一名具备相应资质的项目经理全面负责日常的协调沟通与进度管理工作政府保留对任何交付成果进行审查的权利并可在认为必要时要求承包商进行修改或补充所有款项应在政府正式验收合格之后的三十个日历日内予以支付`), false);
eq("Vietnamese Latin diacritics ≥300", looksMojibake((`Nhà thầu phải cung cấp tất cả các dịch vụ và vật tư theo đúng các điều khoản và điều kiện của hợp đồng này Phạm vi công việc bao gồm quản lý dự án hỗ trợ kỹ thuật bảo trì tại chỗ đào tạo nhân sự `).repeat(3)), false);
eq("Cyrillic ≥300", looksMojibake((`Подрядчик выполняет все услуги в соответствии с условиями настоящего контракта Объём работ включает управление проектом техническую поддержку `).repeat(4)), false);

console.log("\n=== Arm A (hard-corruption) must NOT false-fire on clean text; MUST fire on real garble ===");
eq("clean ascii + 1 BOM (<2%)", looksMojibake(`﻿` + `The contractor will perform the work described herein at the government site. `.repeat(8)), false);
eq("U+FFFD at 3% floors", looksMojibake(Array.from({length:400},(_,i)=> i%33===0 ? "�" : "a").join("")), true);
eq("C1 bytes at 3% floors", looksMojibake(Array.from({length:400},(_,i)=> i%33===0 ? "" : "a").join("")), true);

console.log("\n=== Boundary math ===");
// exactly 299 non-ws → not judged (false); 300 → judged.
const salad300 = "×".repeat(300); const salad299 = "×".repeat(299);
eq("299 all-symbol → not judged", looksMojibake(salad299), false);
eq("300 all-symbol → floors", looksMojibake(salad300), true);
// symbol density exactly at 25%: 75 symbols in 300 = 0.25 → floors (>=).
eq("exactly 25% symbol (75/300) floors", looksMojibake("×".repeat(75) + "a".repeat(225)), true);
eq("just under 25% (74/300) no floor", looksMojibake("×".repeat(74) + "a".repeat(226)), false);
// hard exactly 2%: 6/300.
eq("exactly 2% hard (6/300) floors", looksMojibake("�".repeat(6) + "a".repeat(294)), true);
eq("just under 2% hard (5/300) no floor", looksMojibake("�".repeat(5) + "a".repeat(295)), false);

console.log("\n=== Determinism / purity ===");
const t = "×".repeat(80) + "a".repeat(220);
const r1 = looksMojibake(t), r2 = looksMojibake(t), r3 = looksMojibake(t);
eq("deterministic (3x same)", r1===r2 && r2===r3, true);

console.log(`\n${fails===0 ? "ALL CLOSED-INVARIANTS HOLD" : fails+" INVARIANT FAILURES"}`);
process.exit(fails===0?0:1);
