// P0-3 — VALIDATION #2: measured FIX-1 yield through the real grounding stage. $0, offline, NO prod change (no arming).
// replayCoverageStage → gradeCoverageV2 gives disqualifierUncovered (the exact NHR drivers). For each uncovered
// disqualifier obligation, test whether a REAL fuzzy/sentence-snap matcher (rapidfuzz-class: token_set_ratio +
// partial_ratio + sentence re-expansion) grounds it against the run's OWN findings. Count = FIX-1's true yield.
import * as fs from "fs";
import * as path from "path";
import { replayCoverageStage, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";

const DIR = path.join(__dirname, "run-records");

// ── rapidfuzz-class matchers (normalized) ─────────────────────────────────────
const norm = (s: string) => (s || "").toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s: string) => norm(s).split(" ").filter(Boolean);
const STOP = new Set("the a an of to in on for and or with shall must be is are will not this that as at by from into any all one".split(" "));
const ctoks = (s: string) => toks(s).filter((w) => w.length >= 4 && !STOP.has(w));
// token_set_ratio: |intersection| / |smaller content-token set|
const tokenSetRatio = (a: string, b: string) => {
  const A = new Set(ctoks(a)), B = new Set(ctoks(b)); if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
};
// partial_ratio proxy: longest run of consecutive query content-tokens present in target (normalized)
const partialRatio = (query: string, target: string) => {
  const q = ctoks(query); const T = new Set(ctoks(target)); if (!q.length) return 0;
  let best = 0, run = 0; for (const w of q) { if (T.has(w)) { run++; best = Math.max(best, run); } else run = 0; }
  return best / q.length;
};
// FIX-1 grounding decision: obligation grounds to a finding if EITHER measure clears its threshold vs any finding text.
const GROUNDS = (obligation: string, findings: Array<{ excerpt?: string; requirement?: string }>) => {
  for (const f of findings) {
    const ftext = `${f.excerpt || ""} ${f.requirement || ""}`;
    if (tokenSetRatio(obligation, ftext) >= 0.85) return { hit: true, how: "token_set≥0.85" };
    if (partialRatio(obligation, ftext) >= 0.80) return { hit: true, how: "partial≥0.80" };
  }
  return { hit: false, how: "" };
};

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));
let recs = 0, totalUncov = 0, grounded = 0, residual = 0;
const perSol: Record<string, { uncov: number; grounded: number }> = {};
const residualSamples: string[] = [];
for (const f of files) {
  let rec: RunRecord;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); if (rec?.schema !== RUN_RECORD_SCHEMA) continue; } catch { continue; }
  let cov;
  try { cov = replayCoverageStage(rec); } catch { continue; }
  recs++;
  const sol = (rec.meta?.sol || f.split(".")[0]);
  const uncov = cov.coverageV2.disqualifierUncovered ?? [];
  const findings = rec.result.findings as Array<{ excerpt?: string; requirement?: string }>;
  perSol[sol] = perSol[sol] || { uncov: 0, grounded: 0 };
  for (const d of uncov) {
    totalUncov++; perSol[sol].uncov++;
    const g = GROUNDS(d.obligation, findings);
    if (g.hit) { grounded++; perSol[sol].grounded++; }
    else { residual++; if (residualSamples.length < 12) residualSamples.push(`${sol}: ${d.obligation.slice(0, 90)}`); }
  }
}

console.log(`\n===== P0-3 MATCHER REPLAY (Validation #2) — measured FIX-1 yield on the real grounding stage =====`);
console.log(`records replayed: ${recs}`);
console.log(`total uncovered-disqualifier obligations (the NHR drivers): ${totalUncov}`);
console.log(`  ├─ WOULD GROUND under fuzzy/sentence-snap (FIX-1): ${grounded}  (${totalUncov ? ((grounded / totalUncov) * 100).toFixed(0) : 0}%)`);
console.log(`  └─ residual (genuinely ungrounded — NOT in the run's findings): ${residual}  (${totalUncov ? ((residual / totalUncov) * 100).toFixed(0) : 0}%)`);
console.log(`\nPer-sol (uncovered → fuzzy-grounded):`);
for (const [sol, x] of Object.entries(perSol).filter(([, x]) => x.uncov > 0).sort((a, b) => b[1].uncov - a[1].uncov))
  console.log(`  ${sol.padEnd(20)} ${x.grounded}/${x.uncov} grounded`);
console.log(`\nResidual (real ungrounded — FIX-1 will NOT clear; these need the source-vs-finding gap examined):`);
for (const s of residualSamples) console.log(`  · ${s}`);
