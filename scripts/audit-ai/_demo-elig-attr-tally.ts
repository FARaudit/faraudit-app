// $0 — tally requiredAttribute tokens across the banked cohort: what the demo V2 profile must cover.
import * as fs from "node:fs";
import * as path from "node:path";
import { loadRunRecord } from "./run-record-io";

const COHORT = "scripts/audit-ai/run-records/_ua-cohort";
const tally = new Map<string, { n: number; sols: Set<string> }>();
let total = 0;
for (const f of fs.readdirSync(COHORT).filter((x) => x.endsWith(".json"))) {
  const rec = loadRunRecord(path.join(COHORT, f));
  const sol = f.split("__")[0];
  for (const fd of rec.result.findings as any[]) {
    if (!fd.requiredAttribute) continue;
    total++;
    const e = tally.get(fd.requiredAttribute) ?? { n: 0, sols: new Set<string>() };
    e.n++; e.sols.add(sol);
    tally.set(fd.requiredAttribute, e);
  }
}
console.log("findings with requiredAttribute:", total);
for (const [k, v] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n))
  console.log(String(v.n).padStart(3), k.padEnd(42), [...v.sols].join(","));
