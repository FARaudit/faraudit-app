/**
 * CERT — realism gradient for the box-drawing over-fire candidate.
 * A table rendered with Unicode box-drawing chars is a REALISTIC extractor output
 * (pdftotext -layout, many OCR engines emit │ ─ ┼ for ruled tables). Test progressively
 * more text-dense (realistic) tables to see whether a genuine ruled-table section floors.
 * All obligation-verb-free so they land on the valve.
 */
import { looksMojibake } from "../../src/lib/pdf-ocr";

function score(text: string) {
  const chars = [...text.replace(/\s+/g, "")];
  const n = chars.length;
  let sym = 0;
  for (const ch of chars) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 && c !== 0x09) continue;
    if (c <= 0x7e) continue;
    if ((c >= 0x80 && c <= 0x9f) || c === 0xfffd) continue;
    if (!/\p{L}/u.test(ch)) sym++;
  }
  return { n, symPct: sym / n };
}
function check(label: string, text: string) {
  const s = score(text);
  console.log(`${label.padEnd(46)} n=${String(s.n).padStart(4)} sym=${s.symPct.toFixed(3)} mojibake=${looksMojibake(text)?"YES <<<":"no"}`);
}

console.log("=== box-drawing table realism gradient (obligation-verb-free) ===\n");

// A: pure border art, no cell content (worst case, unrealistic as a real section).
check("A pure border art", Array.from({length:16},()=>`┌──────────┬──────────┐\n├──────────┼──────────┤\n└──────────┴──────────┘`).join("\n"));

// B: ruled table with SHORT cell content (line-item numbers) — realistic CLIN/price grid via pdftotext -layout.
check("B ruled table, short cells", `SECTION B PRICE SCHEDULE\n┌──────┬────────┬────────┐\n` +
  Array.from({length:20},(_,i)=>`│ ${1000+i} │ 12.50 │ 250.00 │\n├──────┼────────┼────────┤`).join("\n") + `\n└──────┴────────┴────────┘`);

// C: ruled table with MEDIUM prose cells (task-area descriptions) — a realistic org/RACI table.
check("C ruled table, prose cells", `SECTION J ORGANIZATION\n` +
  Array.from({length:14},(_,i)=>`│ Task Area ${i+1}: Program Management and Coordination Support │ Jane Smith, Deputy │ backup contact │`).join("\n"));

// D: same prose table but WITH the top/mid/bottom rules present (typical -layout output).
check("D prose cells + full rules", `SECTION J ORGANIZATION AND STAFFING PLAN\n┌────────────────────────────────────────────┬──────────────────┐\n` +
  Array.from({length:12},(_,i)=>`│ Task Area ${i+1}: Program Management Coordination Support │ Lead: Jane Smith │\n├────────────────────────────────────────────┼──────────────────┤`).join("\n") + `\n└────────────────────────────────────────────┴──────────────────┘`);

// E: dot-leader ToC (····) — another common -layout artifact, non-letter symbol.
check("E dot-leader ToC ·", `TABLE OF CONTENTS\n` +
  Array.from({length:26},(_,i)=>`Section ${i+1} — Statement of Work and Related Attachments ${'·'.repeat(40)} ${i+3}`).join("\n"));
