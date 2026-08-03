// $0. Before building a positional table reassembler, measure whether the shredding is worth building for.
// Two things a design needs and I do not yet have:
//   Q1 PREVALENCE — across the banked corpus, how much text is column-shredded, and in WHICH documents?
//      One noticed instance is an anecdote. "Design only on a class you have OBSERVED."
//   Q2 VALUE — on the SF-30 specifically, what does the shredded table say that we do NOT already have from
//      (a) the AcroForm Descript prose just shipped, and (b) SAM's own attachment manifest? If the answer is
//      "nothing", then #2a already solved this from a better angle and #7 is largely redundant.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CORPUS = join(process.cwd(), "scripts", "audit-ai", "run-records");

/** A shred fragment: a short line that is a piece of a word, not a word. No spaces, no terminal punctuation,
 *  letters only, and short. Deliberately conservative — it should UNDER-count, so a large number is believable. */
const isShredFragment = (l: string): boolean => {
  const t = l.trim();
  if (!t || t.length > 12 || /\s/.test(t)) return false;
  return /^[A-Za-z][A-Za-z-]*$/.test(t);
};

/** A run of >=3 consecutive shred fragments is the table signature; isolated short words are ordinary text. */
function shredRuns(text: string): Array<string[]> {
  const lines = text.split("\n");
  const runs: Array<string[]> = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (isShredFragment(l)) cur.push(l.trim());
    else { if (cur.length >= 3) runs.push(cur); cur = []; }
  }
  if (cur.length >= 3) runs.push(cur);
  return runs;
}

(async () => {
  // ── Q1 ──
  console.log("=== Q1 · PREVALENCE across the banked corpus ===");
  if (!existsSync(CORPUS)) {
    console.log("  corpus absent — skipping Q1");
  } else {
    const files: string[] = [];
    for (const e of readdirSync(CORPUS, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith(".json")) files.push(join(CORPUS, e.name));
      else if (e.isDirectory()) for (const f of readdirSync(join(CORPUS, e.name))) if (f.endsWith(".json")) files.push(join(CORPUS, e.name, f));
    }
    console.log(`  records: ${files.length}`);
    let withShred = 0, totalRuns = 0, totalFragChars = 0, totalChars = 0;
    const byDoc = new Map<string, number>();
    for (const f of files) {
      let src = "";
      try { src = JSON.parse(readFileSync(f, "utf8"))?.input?.fullSource ?? ""; } catch { continue; }
      if (!src) continue;
      totalChars += src.length;
      const heads = [...src.matchAll(/^====\s*DOCUMENT:\s*(.+?)\s*====$/gm)].map((m) => ({ n: m[1], at: m.index as number }));
      const runs = shredRuns(src);
      if (runs.length) withShred++;
      totalRuns += runs.length;
      for (const r of runs) {
        totalFragChars += r.join("").length;
        const at = src.indexOf(r[0]);
        let owner = "(primary / unlabelled)";
        for (const h of heads) if (h.at < at) owner = h.n;
        const kind = /SF ?30|amend/i.test(owner) ? "SF-30 / amendment"
          : /wage|WD[_ -]/i.test(owner) ? "wage determination"
          : /draw|C1\.0/i.test(owner) ? "drawing"
          : /\.xlsx|\.docx/i.test(owner) ? "office doc"
          : /Solicitation|SAM Notice/i.test(owner) ? "primary solicitation"
          : "other attachment";
        byDoc.set(kind, (byDoc.get(kind) ?? 0) + 1);
      }
    }
    console.log(`  records containing >=1 shred run : ${withShred}/${files.length}`);
    console.log(`  total shred runs                 : ${totalRuns}`);
    console.log(`  chars inside shred runs          : ${totalFragChars} of ${totalChars} (${(100 * totalFragChars / Math.max(1, totalChars)).toFixed(3)}%)`);
    console.log("  runs by document kind:");
    for (const [k, v] of [...byDoc].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(6)}  ${k}`);
  }

  // ── Q2 ──
  console.log("\n=== Q2 · VALUE — what the shredded SF-30 table adds over what we now have ===");
  const DIR = "/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app/7bdd960c-8373-4c42-a119-6c3262878ce1/scratchpad";
  const f = join(DIR, "Solicitation_Amendment_W50S6U26QA0190001_SF_30.pdf");
  if (!existsSync(f)) { console.log("  real SF-30 not in scratchpad — skipping"); return; }
  const { extractText } = await import("../../src/lib/pdf-text-extractor");
  process.env.AUDIT_INGEST_ACROFORM_FIELDS = "true";
  process.env.AUDIT_INGEST_DISPLACED_RUN = "true";
  const out = await extractText(readFileSync(f));
  delete process.env.AUDIT_INGEST_ACROFORM_FIELDS;
  delete process.env.AUDIT_INGEST_DISPLACED_RUN;

  const runs = shredRuns(out.rawText);
  console.log(`  shred runs in this document: ${runs.length}`);
  runs.forEach((r, i) => console.log(`    run ${i}: ${JSON.stringify(r).slice(0, 200)}`));

  console.log("\n  Does the DEADLINE change survive without any table work?");
  for (const s of ["Response Due", "30 Jul 2026", "06 Aug 2026", "30 Jul 2026 06 Aug 2026"]) {
    console.log(`    ${out.rawText.includes(s) ? "present" : "ABSENT "}  ${JSON.stringify(s)}`);
  }
  console.log("\n  Does the AcroForm Descript already state the change in prose?");
  const d = out.rawText.match(/\[page 1\] Descript = ([\s\S]*?)(?:\n\[page |\n\s*$)/);
  console.log("    " + (d ? JSON.stringify(d[1].trim()).slice(0, 500) : "(not found)"));
})();
