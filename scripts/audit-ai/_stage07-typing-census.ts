// $0 READ-ONLY — how complete is the TYPING the deterministic ladder depends on? Uses the engine's own
// disposeFinding so "disqualifying" means exactly what the ladder means. No model call, no write.
import { readdirSync, readFileSync } from "node:fs";
import { disposeFinding } from "../../src/lib/audit-decide";

const DIR = "scripts/audit-ai/run-records";
let recs = 0, findings = 0, disq = 0, noAttr = 0, noCurable = 0, untyped = 0, noOneCanMove = 0, marked = 0;
const lensTally: Record<string, number> = {};

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let rec: { result?: { inputs?: { findings?: Array<Record<string, unknown>> } } };
  try { rec = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); } catch { continue; }
  const fs = rec?.result?.inputs?.findings;
  if (!Array.isArray(fs)) continue;
  recs++;
  for (const x of fs) {
    findings++;
    if (disposeFinding(x as never) !== "disqualifying") continue;
    disq++;
    const a = !x.requiredAttribute, c = x.curableInWindow === undefined;
    if (a) noAttr++;
    if (c) noCurable++;
    if (a || c) { untyped++; lensTally[String(x.lens ?? "?")] = (lensTally[String(x.lens ?? "?")] ?? 0) + 1; }
    if (x.controllability === "no_one_can_move") noOneCanMove++;
    if (x.universalDefect) marked++;
  }
}

const pct = (n: number, d: number) => d ? `${((n / d) * 100).toFixed(1)}%` : "n/a";
console.log(`banked records: ${recs}   total findings: ${findings}`);
console.log(`DISQUALIFYING findings (disposeFinding): ${disq}\n`);
console.log(`  missing requiredAttribute : ${String(noAttr).padStart(4)}  (${pct(noAttr, disq)})`);
console.log(`  missing curableInWindow   : ${String(noCurable).padStart(4)}  (${pct(noCurable, disq)})`);
console.log(`  UNTYPED (either missing)  : ${String(untyped).padStart(4)}  (${pct(untyped, disq)})  <- branch 5a fails these CLOSED to NHR`);
console.log(`  controllability=no_one_can_move : ${noOneCanMove}   of which marked universalDefect: ${marked}`);
console.log(`\n  untyped disqualifying findings by emitting lens:`);
for (const [k, v] of Object.entries(lensTally).sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);
