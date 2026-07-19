/* Card #574 — REAL corpus survey (Brain ruling: real material only, no synthetic in acceptance chain).
 * Scans every banked run-record for BAR-CLASS findings (controllability=bidder_cannot_move) and buckets by
 * hasGroundedLeadTimeBasis: ungrounded → SUPPRESSION arm candidate; grounded → PRESERVATION arm candidate.
 * Reports provenance (record file + sol) so the acceptance corpus is traceable to real runs.
 * Run: npx tsx scripts/audit-ai/_card574-corpus-survey.ts
 */
import { hasGroundedLeadTimeBasis } from "../../src/lib/mm-evidence-factor";
import fs from "fs";
import path from "path";

const DIR = "scripts/audit-ai/run-records";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));

type Row = { file: string; sol: string; requirement: string; excerpt: string; curable: unknown; kind: unknown; grounded: boolean };
const ungrounded: Row[] = [];
const grounded: Row[] = [];

const findFindingArrays = (o: any, acc: any[][] = []): any[][] => {
  if (Array.isArray(o)) {
    if (o.length && o[0] && typeof o[0] === "object" && ("requirement" in o[0] || "controllability" in o[0])) acc.push(o);
    o.forEach((v) => findFindingArrays(v, acc));
  } else if (o && typeof o === "object") {
    for (const k of Object.keys(o)) findFindingArrays(o[k], acc);
  }
  return acc;
};

for (const file of files) {
  let rec: any;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")); } catch { continue; }
  const sol = rec?.meta?.sol ?? file.split(".")[0];
  const arrays = findFindingArrays(rec);
  const seen = new Set<string>();
  for (const arr of arrays) {
    for (const f of arr) {
      if (f?.controllability !== "bidder_cannot_move") continue;      // bar-class only
      const key = `${f.requirement}::${f.citation}`;
      if (seen.has(key)) continue; seen.add(key);
      const g = hasGroundedLeadTimeBasis([{ requirement: f.requirement, excerpt: f.excerpt }]);
      const row: Row = { file, sol, requirement: f.requirement ?? "", excerpt: (f.excerpt ?? "").slice(0, 140), curable: f.curableInWindow, kind: f.kind, grounded: g };
      (g ? grounded : ungrounded).push(row);
    }
  }
}

const dedupeByReq = (rows: Row[]) => {
  const m = new Map<string, Row>();
  for (const r of rows) if (!m.has(r.requirement)) m.set(r.requirement, r);
  return [...m.values()];
};

const ug = dedupeByReq(ungrounded);
const gr = dedupeByReq(grounded);

console.log(`\n===== SUPPRESSION ARM (ungrounded bar-class findings — mechanic MUST strip flag-ON) — ${ug.length} distinct =====`);
ug.forEach((r, i) => console.log(`#${i} [${r.sol}] curable=${r.curable} kind=${r.kind}\n   req="${r.requirement.slice(0, 110)}"\n   from ${r.file}`));

console.log(`\n===== PRESERVATION ARM (grounded bar-class findings — mechanic MUST emit UNCHANGED flag-ON) — ${gr.length} distinct =====`);
gr.forEach((r, i) => console.log(`#${i} [${r.sol}] curable=${r.curable} kind=${r.kind}\n   req="${r.requirement.slice(0, 110)}"\n   excerpt="${r.excerpt.slice(0, 90)}"\n   from ${r.file}`));

console.log(`\n===== SUMMARY =====`);
console.log(`suppression (ungrounded) distinct: ${ug.length}  |  preservation (grounded) distinct: ${gr.length}`);
