// $0. GATE 1 for the shredded continuation table. Two questions, before any design:
//   Q1 what does the current pipeline produce for the SF-30 Block 14 continuation pages, exactly?
//   Q2 pdf-parse v2 ships getTable() — "detect tables by analysing vector drawing operators, then populate
//      cells with text". If the table has ruled lines, that is POSITIONAL evidence and beats any text
//      heuristic. If it returns nothing, reassembly from text alone is guesswork and the design must change.
//
// Why this matters more than it looks: the earlier \t census found ZERO cell separators in either amendment
// region. So pdf-parse is not telling us "these fragments are columns" — it saw each wrapped cell line as its
// own line. Text alone therefore carries no signal about which fragments belong together, and stitching them
// by shape would be constructing source text, which is the thing we refuse to do.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app/7bdd960c-8373-4c42-a119-6c3262878ce1/scratchpad";
const FILE = "Solicitation_Amendment_W50S6U26QA0190001_SF_30.pdf";

(async () => {
  const buf = readFileSync(join(DIR, FILE));
  const mod: any = require("pdf-parse");
  const Ctor = mod?.PDFParse ?? mod?.default ?? mod;

  console.log(`### ${FILE} (${buf.length} bytes)\n`);

  // ── Q1 ── current text, pages 2-3 (the continuation).
  {
    const inst = new Ctor({ data: buf });
    const out = await inst.getText();
    const pages: any[] = out?.pages ?? [];
    console.log(`pages: ${pages.length}`);
    for (const p of pages.slice(1)) {
      console.log(`\n--- page ${p.num} text, verbatim ---`);
      console.log(String(p.text ?? "").split("\n").map((l: string, i: number) => `  ${String(i).padStart(3)}| ${l}`).join("\n"));
    }
    await inst.destroy?.();
  }

  // ── Q2 ── does the table have ruled lines pdf-parse can find?
  {
    const inst = new Ctor({ data: buf });
    let tr: any = null;
    try { tr = await inst.getTable(); } catch (e) { console.log("\ngetTable THREW:", (e as Error).message); }
    console.log(`\n=== getTable() ===`);
    if (!tr) console.log("  returned nothing");
    else {
      const pages: any[] = tr.pages ?? [];
      console.log(`  pages with table data: ${pages.length}`);
      for (const p of pages) {
        const tables: any[] = p.tables ?? [];
        console.log(`  page ${p.num ?? p.pageNumber}: ${tables.length} table(s)`);
        tables.forEach((t: any, ti: number) => {
          const rows: any[] = Array.isArray(t) ? t : (t.rows ?? t.data ?? []);
          console.log(`    table ${ti}: ${rows.length} row(s)`);
          rows.slice(0, 12).forEach((r: any, ri: number) => {
            const cells = Array.isArray(r) ? r : (r.cells ?? []);
            console.log(`      r${ri}: ` + JSON.stringify(cells.map((c: any) => (typeof c === "string" ? c : c?.text ?? c))).slice(0, 300));
          });
        });
      }
    }
    await inst.destroy?.();
  }
})();
