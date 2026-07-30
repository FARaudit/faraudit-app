/**
 * R2 — the NON-LATIN clean-script lead. A genuinely-translated attachment (CJK/Arabic/
 * Cyrillic/Greek) that is ≥300 non-ws chars is ~100% non-ASCII → arm (B) floors. Question:
 * is that OVER-FIRE (a clean covered section → human review) or ACCEPTABLE?
 * Also confirms \s strips form-feed / BOM so arm-(A) page-break artifacts can't fire.
 */
import { looksMojibake } from "../../src/lib/pdf-ocr";

function m(text: string) {
  const chars = [...(text ?? "").replace(/\s+/g, "")];
  let hard = 0, nonAscii = 0;
  for (const ch of chars) {
    const c = ch.codePointAt(0)!;
    if (c > 0x7e) { nonAscii++; if ((c >= 0x80 && c <= 0x9f) || c === 0xfffd) hard++; }
    else if (c < 0x20 && c !== 0x09) { hard++; nonAscii++; }
  }
  return { len: chars.length, hardPct: hard / chars.length, naPct: nonAscii / chars.length, floor: looksMojibake(text) };
}
function r(l: string, t: string) {
  const x = m(t);
  console.log(`${l.padEnd(40)} len=${String(x.len).padStart(4)} hard=${(x.hardPct*100).toFixed(2)}% nonAscii=${(x.naPct*100).toFixed(1)}% ${x.floor?"FLOOR":"ok"}`);
}

// A full-length (>300 non-ws) translated SOW attachment — CJK.
const CJK_LONG = `附件 J — 工作说明书翻译件（仅供参考）
承包商应按照本合同的所有条款和条件提供全部服务与物资。工作范围包括但不限于以下各
项内容：项目管理、技术支持、现场维护、人员培训、文档编制以及质量保证。所有交付物
均应符合合同规定的质量标准，并在约定的时间内按时提交给政府代表进行审查和验收。承
包商应指派一名具备相应资质的项目经理，全面负责日常的协调、沟通与进度管理工作。政
府保留对任何交付成果进行审查的权利，并可在认为必要时要求承包商进行修改或补充。所
有款项应在政府正式验收合格之后的三十个日历日内予以支付。本翻译件仅供参考之用，如
与英文正本存在任何歧义或不一致之处，一律以英文正本的内容为最终准据。承包商还应遵
守所有适用的联邦、州以及地方的法律法规和相关规定。`;
r("CJK_LONG (>300 translated SOW)", CJK_LONG);

// Arabic
const ARABIC = `الملحق ي — ترجمة بيان العمل
يجب على المقاول أن يقدم جميع الخدمات والمواد وفقًا لجميع شروط وأحكام هذا العقد. يشمل
نطاق العمل على سبيل المثال لا الحصر ما يلي: إدارة المشروع والدعم الفني والصيانة الميدانية
وتدريب الموظفين وإعداد الوثائق وضمان الجودة. يجب أن تتوافق جميع المخرجات مع معايير
الجودة المحددة في العقد وأن تُقدَّم في الوقت المحدد إلى ممثل الحكومة للمراجعة والقبول.
يجب على المقاول تعيين مدير مشروع مؤهل يكون مسؤولاً عن التنسيق والتواصل اليومي.`;
r("ARABIC (translated SOW)", ARABIC);

// Cyrillic
const CYRILLIC = `Приложение Й — перевод описания работ
Подрядчик обязан предоставить все услуги и материалы в соответствии со всеми условиями
настоящего контракта. Объём работ включает, помимо прочего, следующее: управление
проектом, техническую поддержку, полевое обслуживание, обучение персонала, подготовку
документации и обеспечение качества. Все результаты должны соответствовать стандартам
качества, указанным в контракте, и предоставляться в срок представителю правительства.`;
r("CYRILLIC (translated SOW)", CYRILLIC);

// Greek
const GREEK = `Παράρτημα Ι — μετάφραση της δήλωσης εργασιών
Ο ανάδοχος υποχρεούται να παρέχει όλες τις υπηρεσίες και τα υλικά σύμφωνα με όλους τους
όρους της παρούσας σύμβασης. Το αντικείμενο των εργασιών περιλαμβάνει, ενδεικτικά, τα
εξής: διαχείριση έργου, τεχνική υποστήριξη, επιτόπια συντήρηση, εκπαίδευση προσωπικού και
τεκμηρίωση. Όλα τα παραδοτέα πρέπει να πληρούν τα πρότυπα ποιότητας της σύμβασης.`;
r("GREEK (translated SOW)", GREEK);

// Mixed: an English section with a large embedded foreign-language block (realistic —
// a bilingual notice where the English half carries the obligations, foreign half is a copy).
const BILINGUAL = `SECTION J ATTACHMENT — NOTICE TO OFFERORS (BILINGUAL)
The contractor shall comply with all local labor laws at the place of performance.
上記の要件に従い、請負業者はすべての現地労働法を遵守しなければならない。契約の履行
場所におけるすべての適用法を遵守すること。納入物はすべて指定された品質基準を満たさ
なければならない。政府の代表者による検査と受入れの後にのみ支払いが行われるものとする。`;
r("BILINGUAL (EN obligations + JP copy)", BILINGUAL);

console.log("\n=== confirm \\s strips form-feed/BOM (arm-A cannot fire on page breaks) ===");
const clean = "The Government may issue task orders during the ordering period and each order specifies the work. ".repeat(4);
r("clean + 20 form-feeds", clean.replace(/ /g, (c,i)=> i%50===0 ? "\f" : c));
r("clean + leading BOM", "﻿" + clean);
