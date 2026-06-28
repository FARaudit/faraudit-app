// G16 — pre-deploy COST GATE (CEO-approved option A, 2026-06-22). Run before any
// engine deploy: projects $/audit for the current architecture and EXITS NON-ZERO
// (blocks) if it's over the ceiling. Not a per-edit hook (that'd be noise) — a
// single meaningful check at the deploy boundary. Wire into pre-push / CI later.
//
// The projection uses the same cost model as the simulator. For a TRUE number,
// pass the real per-call cached-prefix token count (from count_tokens on the
// assembled package); the default is the measured broken-state baseline so the
// gate correctly BLOCKS until Stage-2 selective reading brings the input down.
// Authoritative confirmation is still cache_read>0 + Anthropic Console spend on a
// real run — this gate is the deterministic pre-deploy guard, not the final word.
//
// Run:  npx tsx scripts/audit-ai/cost-gate.mjs                       (defaults: blocks)
//       npx tsx scripts/audit-ai/cost-gate.mjs --input 120000        (Stage-2 target)
//       npx tsx scripts/audit-ai/cost-gate.mjs --model sonnet-4.6 --ceiling 2
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const PRICE = {
  "opus-4.8": { in: 5.0, out: 25.0 },
  "sonnet-4.6": { in: 3.0, out: 15.0 },
  "haiku-4.5": { in: 1.0, out: 5.0 },
};
const CACHE_WRITE = 1.25, CACHE_READ = 0.10, M = 1_000_000;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

const model = arg("--model", "opus-4.8");
const input = Number(arg("--input", 1_081_830)); // per-call cached-prefix tokens (default = measured broken baseline)
const calls = Number(arg("--calls", 4));         // overview + compliance + risks + V2 judgment
const output = Number(arg("--output", 20_000));
const ceiling = Number(arg("--ceiling", 3));     // $/audit ceiling (default $3; target ~$2)
const cached = !process.argv.includes("--uncached");

const p = PRICE[model];
if (!p) { console.error(`unknown model: ${model}`); process.exit(2); }
const inputCost = cached
  ? (input * CACHE_WRITE) + ((calls - 1) * input * CACHE_READ) // 1 write + (N-1) reads
  : calls * input;                                             // all uncached (broken)
const cost = (inputCost / M) * p.in + (output / M) * p.out;
const pass = cost <= ceiling;

console.log(`COST GATE · model=${model} · ${calls} calls · ${input.toLocaleString()} input/call · cached=${cached}`);
console.log(`projected $/audit = $${cost.toFixed(2)}  ·  ceiling $${ceiling.toFixed(2)}  →  ${pass ? "✅ PASS" : "❌ FAIL"}`);
console.log(pass
  ? "OK to deploy (projection). Authoritative: confirm cache_read>0 + Console spend on a real run."
  : "🚫 BLOCKED: projected $/audit over ceiling — do NOT deploy until the input/architecture is fixed.");
process.exit(pass ? 0 : 1);
