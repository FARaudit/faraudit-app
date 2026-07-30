/**
 * CERT — independent discriminator attack on looksMojibake.
 * Hunt clean sections (≥300 non-ws chars, ZERO obligation verbs so they reach the valve)
 * that reach ≥25% non-ASCII NON-LETTER symbol density OR ≥2% hard-corruption. Any TRUE = candidate over-fire.
 * Also characterizes the two thresholds and the letter-exclusion.
 */
import { looksMojibake } from "../../src/lib/pdf-ocr";

const OBLIG = /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i;

function score(text: string) {
  const chars = [...text.replace(/\s+/g, "")];
  const n = chars.length;
  let hard = 0, sym = 0, asciiLetter = 0, nonAsciiLetter = 0;
  for (const ch of chars) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 && c !== 0x09) { hard++; continue; }
    if (c <= 0x7e) { if (/[A-Za-z]/.test(ch)) asciiLetter++; continue; }
    if ((c >= 0x80 && c <= 0x9f) || c === 0xfffd) { hard++; continue; }
    if (!/\p{L}/u.test(ch)) sym++; else nonAsciiLetter++;
  }
  return { n, hard, sym, hardPct: hard / n, symPct: sym / n, asciiLetter, nonAsciiLetter };
}

function check(label: string, text: string) {
  const s = score(text);
  const mj = looksMojibake(text);
  const hasOblig = OBLIG.test(text);
  const reachesValve = !hasOblig && s.n >= 300;
  const flag = mj && reachesValve ? "  <<< FLOORS + reaches valve (OVER-FIRE CANDIDATE)" : mj ? "  (floors but has obligation verb → not valve path)" : "";
  console.log(
    `${label.padEnd(34)} n=${String(s.n).padStart(4)} hard=${s.hardPct.toFixed(3)} sym=${s.symPct.toFixed(3)} ` +
    `mojibake=${mj?"YES":"no "} oblig=${hasOblig?"Y":"n"}${flag}`
  );
}

console.log("=== CERT discriminator: clean-symbol over-fire hunt (all obligation-verb-free) ===\n");

// 1. Dense bullet lists (•) — realistic SOW deliverable list, no obligation verbs.
check("bullet-list •", `SECTION F — DELIVERABLE SCHEDULE\n` + Array.from({length:40},(_,i)=>`• Item ${i+1}: monthly status report and data package for the period.`).join("\n"));

// 2. Currency-heavy CLIN table.
check("currency € £ ¥ ¢", `SECTION B — PRICE SCHEDULE\n` + Array.from({length:30},(_,i)=>`CLIN ${1000+i}: €${i}0,000 / £${i}5,000 / ¥${i}00,000 / ¢${i}5 unit price and extended amount.`).join("\n"));

// 3. Math/engineering spec — symbol dense, obligation verbs stripped.
check("math ° ± × ÷ ² ³ ≤ ≥ µ Ω", `SECTION C — SPECS\nTemp: −40 °C to +85 °C (±2 °C). Torque 12 N·m ± 0.5. Coil 4 Ω ± 5 %. ≥ 100 MΩ. Flow 3.2 m³/h ± 0.1. Pressure ≤ 6 bar, ≥ 2 bar. Area 12.5 m² ± 0.2. Ø 25 mm ± 0.05. 7.85 g/cm³. 50 Hz ± 1 %. 230 V ± 10 %. ≥ 92 %. λ = 632.8 nm. €1,250 / £980 / ¥135,000. © 2026. 5 µm ± 1 µm. Repeat: −40 °C to +85 °C (±2 °C). 4 Ω ± 5 %. ≥ 100 MΩ. 3.2 m³/h. ≤ 6 bar. 12.5 m². Ø 25 mm. 7.85 g/cm³. 50 Hz. 230 V. λ = 632.8 nm.`);

// 4. Box-drawing / table-border ASCII-art (Unicode box chars are non-letter symbols).
check("box-drawing ─ │ ┼ ═ ║", `SECTION J — ORG CHART\n` + Array.from({length:14},()=>`┌────────────┬────────────┬────────────┐\n│ Task Area  │ Lead       │ Backup     │\n├────────────┼────────────┼────────────┤`).join("\n"));

// 5. Arrow-heavy process flow.
check("arrows → ⇒ ▶", `SECTION H — WORKFLOW\n` + Array.from({length:24},(_,i)=>`Step ${i+1} → review ⇒ approve ▶ archive → next.`).join("\n"));

// 6. Emoji / dingbat.
check("dingbat ✓ ✗ ★ ☐", `SECTION E — CHECKLIST\n` + Array.from({length:30},(_,i)=>`✓ Task ${i+1} complete ★ verified ☐ pending ✗ n/a.`).join("\n"));

// 7. Heavy-symbol PRINTABLE Latin-1 font-dump (the R2 salad — SHOULD floor, has no obligation verb).
check("R2 latin1 salad ¬þ Æ¢Ø", `¬þ Æ¢Ø¡™ ½¾¿ ×÷ ¬þ Æ¢Ø¡™ ½¾¿ ×÷ ¬þ Æ¢Ø¡™ ½¾¿ ×÷ `.repeat(30));

// 8. COHERENT foreign LETTERS (must NOT floor — R2 closed).
check("CJK coherent letters", `附件 J 工作说明书 承包商按照本合同的所有条款和条件提供全部服务与物资 工作范围包括项目管理技术支持现场维护人员培训文档编制以及质量保证 所有交付物均应符合合同规定的质量标准并在约定的时间内按时提交给政府代表进行审查和验收 政府保留对任何交付成果进行审查的权利`);

console.log("\n=== letter-exclusion sanity: same salad with letters swapped for coherent script ===");
check("Cyrillic coherent", `Приложение Ж Технический перевод Подрядчик выполняет все услуги в соответствии с условиями настоящего контракта Объем работ включает управление проектом техническую поддержку обслуживание на месте обучение персонала подготовку документации`);
