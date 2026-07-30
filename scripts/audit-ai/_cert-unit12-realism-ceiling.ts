/**
 * CERT — pin the realism ceiling of the dot-leader ToC over-fire.
 * A REAL ToC line = "Section Title .................. 12". The dot-run length vs title length
 * decides symPct. Vary title length / dot fill to find where a genuinely realistic ToC floors.
 * Uses U+00B7 (MIDDLE DOT) — the glyph Word emits for a "····" leader tab; and also '.' ASCII
 * leaders (which do NOT floor, being ASCII) as the contrast.
 */
import { looksMojibake } from "../../src/lib/pdf-ocr";

function symPct(text: string) {
  const chars = [...text.replace(/\s+/g, "")]; let sym = 0;
  for (const ch of chars) { const c = ch.codePointAt(0)!; if (c>0x7e && !((c>=0x80&&c<=0x9f)||c===0xfffd) && !/\p{L}/u.test(ch)) sym++; }
  return sym / chars.length;
}
function row(title: string, dots: number, dotChar: string, page: number) {
  return `${title} ${dotChar.repeat(dots)} ${page}`;
}
function toc(dotChar: string, titleLen: number, dots: number) {
  return "TABLE OF CONTENTS\n" + Array.from({length:24},(_,i)=>
    row("Section " + String(i+1) + " " + "Title".padEnd(titleLen-9, "x"), dots, dotChar, i+3)).join("\n");
}

console.log("=== dot-leader ToC realism ceiling (U+00B7 middle-dot leaders) ===\n");
for (const [tl, d] of [[30,45],[40,40],[50,30],[60,20],[70,12]] as const) {
  const t = toc("·", tl, d);
  console.log(`title~${tl}ch dots=${d}  sym=${symPct(t).toFixed(3)}  mojibake=${looksMojibake(t)?"YES <<< floors":"no"}`);
}
console.log("\n(contrast) ASCII '.' leaders NEVER floor regardless of dot count:");
for (const d of [40, 60, 80]) {
  const t = toc(".", 30, d);
  console.log(`ascii-dot dots=${d}  sym=${symPct(t).toFixed(3)}  mojibake=${looksMojibake(t)?"YES":"no"}`);
}
