/* Card #574 — extract VERBATIM grounded-mechanic sentences from REAL banked solicitation sources, so the
 * PRESERVATION-arm specimens are quoted real material (Brain no-synthetic rule). For each candidate record,
 * find sentences that (a) match hasGroundedLeadTimeBasis and (b) read as a bar the offeror must HOLD/acquire.
 * Run: npx tsx scripts/audit-ai/_card574-extract-grounded.ts
 */
import { hasGroundedLeadTimeBasis } from "../../src/lib/mm-evidence-factor";
import fs from "fs";
import path from "path";

const DIR = "scripts/audit-ai/run-records";
const TARGETS = ["697DCK-26-R-00186", "70B01C26R00000096", "W9126G26RA087", "FA813726R0033", "FA442726Q1068"];

const getSource = (rec: any): string => rec?.result?.inputs?.source ?? rec?.input?.source ?? rec?.input?.fullSource ?? "";

for (const sol of TARGETS) {
  const file = fs.readdirSync(DIR).find((f) => f.startsWith(sol) && f.endsWith(".run-record.json"));
  if (!file) { console.log(`\n### ${sol}: no record`); continue; }
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  const src = getSource(rec);
  if (!src) { console.log(`\n### ${sol}: no source in record`); continue; }
  const sentences = src.split(/(?<=[.!?])\s+|\n+/).map((s: string) => s.trim()).filter(Boolean);
  const hits = sentences.filter((s: string) => s.length > 25 && s.length < 320 && hasGroundedLeadTimeBasis([{ requirement: s, excerpt: s }]));
  console.log(`\n### ${sol}  (${file})  — ${hits.length} grounded-mechanic sentence(s)`);
  hits.slice(0, 6).forEach((s: string, i: number) => console.log(`  [${i}] ${s.replace(/\s+/g, " ")}`));
}
