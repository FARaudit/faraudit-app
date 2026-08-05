// STAGE LEDGER ANALYZER — answers CEO queue #4, "where does the engine spend wall-clock and tokens".
// $0, deterministic, reads a banked run record. No model call, no paid run.
//
// WHY IT COULD NOT BE ANSWERED BEFORE: the engine has always measured per-call model, tokens and cache
// split, but `usageCalls` was reduced to one dollar figure for billing and then dropped, and `UsageCall`
// did not even declare the `label`/`ms` the structured path was already emitting. PR #411 stopped
// discarding it. That fix is forward-only — it cannot retro-fill a run that already happened — so of 113
// banked records ONE carried any wall_ms and TWO any cost_usd. Only a run banked after #411 can answer it.
//
// TWO NUMBERS THAT ARE NOT THE SAME THING, and conflating them is the trap this file exists to avoid:
//   · SUM of per-call ms — how much model time was bought. Concurrent calls each count in full.
//   · WALL-CLOCK of the run — what the customer waited. Always ≤ the sum when anything runs concurrently.
// The panel seats and the lens fan-out run CONCURRENTLY, so a stage's share of the SUM is a share of
// spend, NOT a share of the wait. This prints both and never sums one into the other.
//
//   npx tsx scripts/audit-ai/analyze-stage-ledger.ts <path-to-run-record.json>

import fs from "node:fs";
import { aggregate, costForCall, type UsageCall } from "../../src/lib/audit-cost";

const path = process.argv[2];
if (!path) { console.error("usage: analyze-stage-ledger.ts <run-record.json>"); process.exit(2); }
if (!fs.existsSync(path)) { console.error(`no such record: ${path}`); process.exit(2); }

const rec = JSON.parse(fs.readFileSync(path, "utf8"));
const usage: UsageCall[] = rec?.result?.usage ?? rec?.usage ?? [];

if (!usage.length) {
  // HONEST FAIL, not a zero. A record with no ledger predates PR #411 (or the flag was off) — it is
  // UNKNOWN, not "the engine spent nothing". Printing 0.0s here is how a discard becomes a measurement.
  console.error(`NO STAGE LEDGER in ${path}`);
  console.error("This record carries no `result.usage`. Either it predates PR #411 (2026-08-03) or");
  console.error("AUDIT_BANK_RUN_RECORD was off for that run. The answer is UNKNOWN — not zero.");
  process.exit(1);
}

const withMs = usage.filter((u) => typeof u.ms === "number");
const withLabel = usage.filter((u) => typeof u.label === "string" && u.label);

console.log(`── STAGE LEDGER · ${rec?.meta?.sol ?? "(no sol)"} · run ${rec?.meta?.runId ?? "?"} ──`);
console.log(`${usage.length} model calls · ${withMs.length} carry ms · ${withLabel.length} carry a label`);
if (withMs.length < usage.length || withLabel.length < usage.length) {
  // NAMED SKIP, never a silent one — an unlabelled call is real spend that this table cannot attribute.
  console.log(`⚠ ${usage.length - withMs.length} call(s) without ms and ${usage.length - withLabel.length} without a label`);
  console.log(`  are counted in the TOTALS below but cannot be attributed to a stage. Coverage, not a rounding note.`);
}

const wallSec = rec?.meta?.wallClockSec;
const sumMs = withMs.reduce((n, u) => n + (u.ms ?? 0), 0);

type Row = { label: string; calls: number; ms: number; inTok: number; outTok: number; cacheR: number; cacheW: number; usd: number };
const byLabel = new Map<string, Row>();
for (const u of usage) {
  const key = u.label || "(unlabelled)";
  const r = byLabel.get(key) ?? { label: key, calls: 0, ms: 0, inTok: 0, outTok: 0, cacheR: 0, cacheW: 0, usd: 0 };
  r.calls++; r.ms += u.ms ?? 0;
  r.inTok += u.input_tokens ?? 0; r.outTok += u.output_tokens ?? 0;
  r.cacheR += u.cache_read ?? 0; r.cacheW += u.cache_write ?? 0;
  r.usd += costForCall(u);
  byLabel.set(key, r);
}
const rows = [...byLabel.values()].sort((a, b) => b.usd - a.usd);
const { totals, perModel } = aggregate(usage);

console.log(`\n── BY STAGE, ranked by SPEND ──`);
console.log(`${"stage".padEnd(34)} ${"calls".padStart(5)} ${"model-sec".padStart(10)} ${"in".padStart(9)} ${"out".padStart(8)} ${"cache-rd".padStart(9)} ${"$".padStart(8)}  ${"% $".padStart(6)}`);
for (const r of rows) {
  const pct = totals.usd > 0 ? (r.usd / totals.usd) * 100 : 0;
  console.log(
    `${r.label.slice(0, 34).padEnd(34)} ${String(r.calls).padStart(5)} ${(r.ms / 1000).toFixed(1).padStart(10)} ` +
    `${r.inTok.toLocaleString().padStart(9)} ${r.outTok.toLocaleString().padStart(8)} ${r.cacheR.toLocaleString().padStart(9)} ` +
    `${r.usd.toFixed(4).padStart(8)}  ${pct.toFixed(1).padStart(5)}%`
  );
}

console.log(`\n── BY MODEL ──`);
for (const m of perModel.sort((a, b) => b.usd - a.usd)) {
  console.log(`${m.model.padEnd(34)} ${String(m.calls).padStart(5)} calls  $${m.usd.toFixed(4)}${m.priceKey ? "" : "   ⚠ UNPRICED — excluded from $ totals"}`);
}

console.log(`\n── TOTALS ──`);
console.log(`  spend            $${totals.usd.toFixed(4)}${totals.unpriced_calls ? `   ⚠ ${totals.unpriced_calls} unpriced call(s) — the real figure is HIGHER` : ""}`);
console.log(`  tokens in/out    ${totals.input_tokens.toLocaleString()} / ${totals.output_tokens.toLocaleString()}`);
console.log(`  cache read/write ${totals.cache_read.toLocaleString()} / ${totals.cache_write.toLocaleString()}`);
console.log(`  model-time SUM   ${(sumMs / 1000).toFixed(1)}s  — time BOUGHT; concurrent calls each count in full`);
if (typeof wallSec === "number") {
  const conc = sumMs / 1000 / wallSec;
  console.log(`  wall-clock       ${wallSec.toFixed(1)}s  — what the customer WAITED`);
  console.log(`  concurrency      ${conc.toFixed(2)}×  (model-time ÷ wall-clock; 1.0 = fully serial)`);
} else {
  console.log(`  wall-clock       NOT RECORDED in this run's meta — the customer-wait half is UNKNOWN,`);
  console.log(`                   so no share-of-wait can be computed from this record. Not assumed to equal the sum.`);
}
