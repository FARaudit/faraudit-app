// Audit Cost Simulator — predict $/audit for ANY engine architecture WITHOUT
// running an audit (zero Opus spend). Two modes:
//   1) MODEL mode (default): deterministic cost arithmetic over a token profile.
//      Baseline tokens are the MEASURED value from the live worker logs
//      (N4008526R0065 / audit d611c273: 1,081,830 assembled input tokens), so the
//      "current" row is ground truth, not a guess.
//   2) COUNT mode (--count <file>): calls Anthropic's FREE /v1/messages/count_tokens
//      on a real text file to get an EXACT token count for that payload (no inference,
//      no cost). Use this to measure real per-section subsets as selective retrieval
//      is built.
//
// Run:  npx tsx scripts/audit-ai/simulate-audit-cost.mjs
//       npx tsx scripts/audit-ai/simulate-audit-cost.mjs --input 1081830 --output 20000
//       npx tsx scripts/audit-ai/simulate-audit-cost.mjs --count /tmp/section-LM.txt
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

// ── Official 2026 pricing, $ per 1M tokens (input / output) ──
const PRICE = {
  "opus-4.8":   { in: 5.0, out: 25.0 },
  "sonnet-4.6": { in: 3.0, out: 15.0 },
  "haiku-4.5":  { in: 1.0, out: 5.0 },
};
// Prompt-cache multipliers on the INPUT rate (5-min ephemeral TTL).
const CACHE_WRITE = 1.25; // first call pays this to write the prefix
const CACHE_READ  = 0.10; // subsequent calls read at 1/10th

const M = 1_000_000;
const usd = (n) => `$${n.toFixed(2)}`;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

// MEASURED baseline (live worker log, audit d611c273):
const BASE_INPUT = Number(arg("--input", 1_081_830));   // assembled input tokens per call
const TOTAL_OUTPUT = Number(arg("--output", 20_000));    // ~overview+compliance+risks output

// ── COUNT mode: exact token count of a real file via the free endpoint ──
async function countTokens(text, model = "claude-opus-4-8") {
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, system: "You output one JSON object.", messages: [{ role: "user", content: text }] }),
  });
  if (!res.ok) throw new Error(`count_tokens ${res.status}: ${await res.text()}`);
  return (await res.json()).input_tokens;
}

if (process.argv.includes("--count")) {
  const fs = await import("node:fs");
  const file = arg("--count");
  const text = fs.readFileSync(file, "utf8");
  const n = await countTokens(text);
  console.log(`EXACT tokens for ${file}: ${n.toLocaleString()} (FREE measurement, no inference)`);
  process.exit(0);
}

// ── Cost helpers ──
// 3 sequential calls (overview/compliance/risks) sharing a doc prefix.
function costThreeCalls({ model, inputPerCall, cached, outputTotal }) {
  const p = PRICE[model];
  let input;
  if (cached) {
    // call 1 writes the shared prefix; calls 2 & 3 read it.
    input = (inputPerCall * CACHE_WRITE) + (2 * inputPerCall * CACHE_READ);
  } else {
    input = 3 * inputPerCall; // every call pays full uncached input (today's bug)
  }
  return (input / M) * p.in + (outputTotal / M) * p.out;
}

// Tiered: one cheap-model bulk read of the full package -> small extract; then
// 3 judgment calls over the small cached extract.
function costTiered({ readModel, judgeModel, fullInput, extractTokens, outputTotal }) {
  const rp = PRICE[readModel], jp = PRICE[judgeModel];
  const readCost = (fullInput / M) * rp.in + (extractTokens / M) * rp.out; // 1 pass, produces extract
  const judge = costThreeCalls({ model: judgeModel, inputPerCall: extractTokens, cached: true, outputTotal });
  return readCost + judge;
}

console.log("══════════════════════════════════════════════════════════════════════");
console.log("  AUDIT COST SIMULATOR · N4008526R0065 (33-doc package)");
console.log(`  MEASURED baseline: ${BASE_INPUT.toLocaleString()} input tokens/call · ~${TOTAL_OUTPUT.toLocaleString()} output total`);
console.log("  (no audit run · no Opus spend · pure projection)");
console.log("══════════════════════════════════════════════════════════════════════\n");

const SELECTIVE = 120_000;  // per-call relevant-section subset (target)
const EXTRACT   = 50_000;   // cheap-model structured extract size

const rows = [
  ["TODAY — broken: 3× full, UNCACHED (Opus)", costThreeCalls({ model: "opus-4.8", inputPerCall: BASE_INPUT, cached: false, outputTotal: TOTAL_OUTPUT }), "the bug; ×retries/reruns ≈ the real $22"],
  ["FIX 1 — caching only, full prefix (Opus)", costThreeCalls({ model: "opus-4.8", inputPerCall: BASE_INPUT, cached: true, outputTotal: TOTAL_OUTPUT }), "1M cache-WRITE alone is costly → not enough"],
  ["FIX 2 — selective sections ~120k, cached (Opus)", costThreeCalls({ model: "opus-4.8", inputPerCall: SELECTIVE, cached: true, outputTotal: TOTAL_OUTPUT }), "Opus reads only relevant sections"],
  ["FIX 2 — selective sections ~120k, cached (Sonnet)", costThreeCalls({ model: "sonnet-4.6", inputPerCall: SELECTIVE, cached: true, outputTotal: TOTAL_OUTPUT }), "same, Sonnet judgment"],
  ["FIX 3 — Haiku reads all → Opus judges 50k extract", costTiered({ readModel: "haiku-4.5", judgeModel: "opus-4.8", fullInput: BASE_INPUT, extractTokens: EXTRACT, outputTotal: TOTAL_OUTPUT }), "cheap bulk read, Opus quality on the findings"],
  ["FIX 3 — Haiku reads all → Sonnet judges 50k extract", costTiered({ readModel: "haiku-4.5", judgeModel: "sonnet-4.6", fullInput: BASE_INPUT, extractTokens: EXTRACT, outputTotal: TOTAL_OUTPUT }), "lowest cost"],
];

for (const [label, cost, note] of rows) {
  const flag = cost <= 2 ? "✅" : cost <= 4 ? "🟡" : "❌";
  console.log(`${flag} ${usd(cost).padStart(7)}  ${label}`);
  console.log(`            └─ ${note}`);
}
console.log("\n  ✅ ≤ $2/audit   🟡 ≤ $4   ❌ over budget");
console.log("  Note: FIX 2/3 numbers depend on the selective-section token count —");
console.log("  measure it EXACTLY (free) with: --count <section-file> as retrieval is built.");
