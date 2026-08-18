// $0 READ-ONLY — which INPUT binds the verdict? Replays the REAL deriveVerdict over every banked run
// record at production flag parity, then re-runs each with one input cleared. No model call, no write.
import { readdirSync, readFileSync } from "node:fs";
import { deriveVerdict } from "../../src/lib/audit-decide";
import { registerJudgmentVerifier } from "../../src/lib/audit-judgment-layer";

registerJudgmentVerifier();

const DIR = "scripts/audit-ai/run-records";
type Row = { file: string; banked: string; replay: string; noDocGate: string; noCovGate: string; allClear: string };
const rows: Row[] = [];
const tally = (xs: string[]) => xs.reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let rec: { result?: { verdict?: string; inputs?: Record<string, unknown> } };
  try { rec = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); } catch { continue; }
  const inp = rec?.result?.inputs;
  if (!inp || !Array.isArray(inp.findings)) continue;
  const run = (patch: Record<string, unknown>) => { try { return deriveVerdict({ ...inp, ...patch } as never).verdict; } catch (e) { return `THREW:${(e as Error).name}`; } };
  const cov = inp.coverageV2 as undefined | Record<string, unknown>;
  const cleanCov = cov ? { ...cov, disqualifierUncovered: [], ungroundedRead: [], unreadable: [] } : cov;
  rows.push({
    file: f.slice(0, 34), banked: rec.result?.verdict ?? "?",
    replay: run({}),
    noDocGate: run({ documentsComplete: true, manifestComplete: true }),
    noCovGate: run({ coverageV2: cleanCov, coverageComplete: true }),
    allClear: run({ documentsComplete: true, manifestComplete: true, coverageV2: cleanCov, coverageComplete: true }),
  });
}

console.log(`records replayed: ${rows.length}`);
const fid = rows.filter((r) => r.banked === r.replay).length;
console.log(`replay fidelity (replay === banked): ${fid}/${rows.length}\n`);
console.log("BANKED      ", tally(rows.map((r) => r.banked)));
console.log("REPLAY      ", tally(rows.map((r) => r.replay)));
console.log("clear DOC gates only  ", tally(rows.map((r) => r.noDocGate)));
console.log("clear COV gates only  ", tally(rows.map((r) => r.noCovGate)));
console.log("clear BOTH            ", tally(rows.map((r) => r.allClear)));

console.log("\n--- per-record (replay → docCleared → covCleared → allCleared) ---");
for (const r of rows.sort((a, b) => a.file.localeCompare(b.file)))
  console.log(`  ${r.file.padEnd(35)} ${r.replay.padEnd(19)} ${r.noDocGate.padEnd(19)} ${r.noCovGate.padEnd(19)} ${r.allClear}`);
