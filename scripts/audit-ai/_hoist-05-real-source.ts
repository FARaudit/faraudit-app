// $0 read-only. Apply the repair to the REAL assembled source of run eab43ada and measure it.
// A suite of hand-picked specimens proves the recogniser works on what I already understood; only the whole
// document shows what I did not. Reports: repairs per region, conservation, the acceptance string, and — the
// part that matters most — the RESIDUE: every "\t"-terminated line the repair declined to touch.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { repairDisplacedRuns } from "../../src/lib/pdf-displaced-run-repair";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";
const nonWs = (s: string) => s.replace(/\s/g, "").split("").sort().join("");

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

  console.log("=== repairs per region ===");
  console.log("  region".padEnd(58) + "  \\t-lines  repaired  residue  conserved");
  let totSites = 0, totRepaired = 0;
  const residue: Array<{ region: string; opening: string; next: string }> = [];
  for (const r of regions) {
    const lines = r.text.split("\n");
    const sites = lines.filter((l, i) => l.endsWith("\t") && i + 2 < lines.length).length;
    const { text: fixed, repairs, refused } = repairDisplacedRuns(r.text);
    const conserved = nonWs(r.text) === nonWs(fixed);
    totSites += sites; totRepaired += repairs.length;
    console.log("  " + r.name.slice(0, 54).padEnd(56) +
      String(sites).padStart(9) + String(repairs.length).padStart(10) +
      String(sites - repairs.length).padStart(9) + (refused ? "  REFUSED" : conserved ? "     yes" : "      NO"));
    if (refused) console.log(`      !! ${refused}`);
    // Collect what was declined, for eyeballing.
    const fl = r.text.split("\n");
    const repairedLines = new Set(repairs.map((x) => x.line));
    for (let i = 0; i + 2 < fl.length; i++) {
      if (fl[i].endsWith("\t") && !repairedLines.has(i)) residue.push({ region: r.name, opening: fl[i], next: fl[i + 1] });
    }
  }
  console.log("  " + "TOTAL".padEnd(56) + String(totSites).padStart(9) + String(totRepaired).padStart(10) + String(totSites - totRepaired).padStart(9));

  // Whole-document pass — the shape the extractor will actually see.
  const { text: wholeFixed, repairs: wholeRepairs, refused } = repairDisplacedRuns(full);
  console.log(`\n=== whole-document pass ===`);
  console.log(`  repairs ................. ${wholeRepairs.length}`);
  console.log(`  refused ................. ${refused ?? "(no)"}`);
  console.log(`  conservation ............ ${nonWs(full) === nonWs(wholeFixed) ? "HOLDS" : "**VIOLATED**"}`);
  console.log(`  length .................. ${full.length} -> ${wholeFixed.length} (${wholeFixed.length - full.length})`);

  console.log("\n=== acceptance: strings that were ABSENT before ===");
  for (const needle of [
    "the Government will disclose the following information, if applicable:",
    "The clause at Federal Acquisition Regulation (FAR) 52.202-1, Definitions, is incorporated by reference.",
    "The Contractor shall only tender for acceptance those items that conform to the requirements",
  ]) {
    console.log(`  before=${String(full.includes(needle)).padEnd(5)}  after=${String(wholeFixed.includes(needle)).padEnd(5)}  ${JSON.stringify(needle.slice(0, 62))}`);
  }

  console.log("\n=== mark distribution (which rule justified each repair) ===");
  const marks = new Map<string, number>();
  for (const r of wholeRepairs) marks.set(r.mark, (marks.get(r.mark) ?? 0) + 1);
  for (const [k, v] of marks) console.log(`  ${k.padEnd(24)} ${v}`);

  console.log(`\n=== RESIDUE — ${residue.length} '\\t' line(s) the repair DECLINED (verbatim) ===`);
  for (const x of residue.slice(0, 25)) {
    console.log(`  [${x.region.slice(0, 24)}] …${JSON.stringify(x.opening.slice(-58))}\n        next: ${JSON.stringify(x.next.slice(0, 80))}`);
  }
  if (residue.length > 25) console.log(`  … and ${residue.length - 25} more`);
})();
