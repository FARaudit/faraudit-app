// $0 read-only. FALSIFICATION probe, written before any fix exists.
//
// The hypothesis from probe 01: pdf-parse v2 emits `cellSeparator` ("\t") when it detects a large HORIZONTAL
// gap between two items on the SAME baseline, then `lineEnforce` breaks the line. So a right-margin clause
// heading is emitted as:   <enum> . <first visual line of body>\t\n<HeadingWords>\n<rest of body>
// The heading is NOT deleted and the subject is NOT deleted — the heading is INTERPOLATED into the sentence,
// which severs the sentence across two \n-delimited segments.
//
// A fix keyed on that shape is only safe if the shape is SPECIFIC. So this probe reports the shape's
// population AND its complement: every "\t\n" that does NOT look like a heading hoist. If the complement is
// large or heterogeneous, a shape-keyed repair will corrupt real text and the design must change.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";

/** A heading candidate: the segment sitting alone between a cell-separator break and the next line. */
const isHeadingLike = (s: string) => {
  const t = s.trim();
  return t.length > 0 && t.length <= 60 && t.split(/\s+/).length <= 6 && !/[.!?:;]$/.test(t) && /[A-Za-z]/.test(t);
};

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from("audits").select("raw_pdf_text").eq("id", AUDIT).single();
  if (error || !data) { console.error("FATAL:", error?.message); process.exit(1); }
  const full = (data as any).raw_pdf_text as string;

  const heads = [...full.matchAll(/^====\s*DOCUMENT:\s*(.+?)\s*====$/gm)]
    .map((m) => ({ name: m[1], at: m.index as number, len: m[0].length }));
  const regions = heads.map((h, i) => ({
    name: h.name,
    text: full.slice(h.at + h.len, i + 1 < heads.length ? heads[i + 1].at : full.length),
  }));

  let totalTabBreak = 0, hoistShape = 0, other = 0;
  const otherExamples: string[] = [];
  const hoistExamples: Array<{ region: string; heading: string; orphanDot: boolean; contHasLowerStart: boolean }> = [];

  console.log("=== every '\\t\\n' in the run, classified ===\n");
  for (const r of regions) {
    const lines = r.text.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      if (!lines[i].endsWith("\t")) continue;
      totalTabBreak++;
      const heading = lines[i + 1];
      const cont = lines[i + 2] ?? "";
      if (isHeadingLike(heading)) {
        hoistShape++;
        // Corroborating marks, each independently checkable:
        //  · orphanDot     — the heading's terminal period stranded after the enumerator on the opening line
        //  · lower-start   — the continuation resumes mid-sentence (lowercase or a verb), proving the split
        const orphanDot = /\(\s*[a-z0-9ivx]{1,4}\s*\)\s+\.\s/i.test(lines[i]) || /\S\s+\.\s/.test(lines[i]);
        const contHasLowerStart = /^[a-z]/.test(cont.trim());
        hoistExamples.push({ region: r.name, heading: heading.trim(), orphanDot, contHasLowerStart });
      } else {
        other++;
        if (otherExamples.length < 15) {
          otherExamples.push(`[${r.name.slice(0, 26)}] …${JSON.stringify(lines[i].slice(-60))} ⏎ ${JSON.stringify(heading.slice(0, 80))}`);
        }
      }
    }
  }

  console.log(`  '\\t' at end of line, total .................. ${totalTabBreak}`);
  console.log(`    ├─ next line is HEADING-LIKE (the shape) ... ${hoistShape}`);
  console.log(`    └─ next line is NOT heading-like ........... ${other}   <-- the complement a fix must not touch\n`);

  const withDot = hoistExamples.filter((h) => h.orphanDot).length;
  const withLower = hoistExamples.filter((h) => h.contHasLowerStart).length;
  const withBoth = hoistExamples.filter((h) => h.orphanDot && h.contHasLowerStart).length;
  console.log("=== corroboration within the heading-like population ===");
  console.log(`  orphaned '.' on the opening line ............. ${withDot}/${hoistShape}`);
  console.log(`  continuation resumes lowercase (mid-sentence) ${withLower}/${hoistShape}`);
  console.log(`  BOTH marks present .......................... ${withBoth}/${hoistShape}`);
  console.log(`  NEITHER mark (weakest evidence) ............. ${hoistExamples.filter((h) => !h.orphanDot && !h.contHasLowerStart).length}/${hoistShape}\n`);

  console.log("=== the heading-like population, per region ===");
  const byRegion = new Map<string, string[]>();
  for (const h of hoistExamples) byRegion.set(h.region, [...(byRegion.get(h.region) ?? []), h.heading]);
  for (const [reg, hs] of byRegion) console.log(`  ${String(hs.length).padStart(3)}  ${reg}\n       ${hs.slice(0, 40).join(" · ").slice(0, 400)}`);

  console.log("\n=== THE COMPLEMENT — '\\t\\n' that is NOT a heading (a fix must leave these alone) ===");
  if (!otherExamples.length) console.log("  (none)");
  for (const e of otherExamples) console.log("  " + e);
})();
