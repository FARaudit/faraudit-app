// $0 proof for cost-ledger.ts — cost math (plain/cache/output), aggregation, idempotent append. No API.
import fs from "fs";
import os from "os";
import path from "path";
import { costForCall, aggregate, appendLedgerRow, type LedgerRow } from "./cost-ledger";

let pass = 0; const fails: string[] = [];
const near = (l: string, g: number, e: number, tol = 1e-6) => { if (Math.abs(g - e) <= tol) pass++; else fails.push(`${l}: ${g} != ${e}`); };
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

// 1) plain Opus: 100k in @ $5/M = $0.50 + 20k out @ $25/M = $0.50 → $1.00
near("opus plain input+output", costForCall({ model: "claude-opus-4-8", input_tokens: 100_000, output_tokens: 20_000, cache_write: 0, cache_read: 0 }), 1.00);
// 2) cached Opus: write 100k @ 5×1.25/M=$0.625 + read 200k @ 5×0.10/M=$0.10 + out 20k=$0.50 → $1.225
near("opus cache write+read+output", costForCall({ model: "claude-opus-4-8", input_tokens: 0, output_tokens: 20_000, cache_write: 100_000, cache_read: 200_000 }), 1.225);
// 3) Haiku plain: 1M in @ $1 + 0 out → $1.00
near("haiku 1M input", costForCall({ model: "claude-haiku-4-5-20251001", input_tokens: 1_000_000, output_tokens: 0, cache_write: 0, cache_read: 0 }), 1.00);
// 4) unknown model → 0
near("unknown model → 0", costForCall({ model: "gpt-4o", input_tokens: 1_000_000, output_tokens: 0, cache_write: 0, cache_read: 0 }), 0);

// 5) aggregate across models + unpriced flag
const agg = aggregate([
  { model: "claude-haiku-4-5", input_tokens: 500_000, output_tokens: 10_000, cache_write: 0, cache_read: 0 }, // 0.5+0.05=0.55
  { model: "claude-opus-4-8", input_tokens: 100_000, output_tokens: 20_000, cache_write: 0, cache_read: 0 },  // 1.00
  { model: "gpt-4o", input_tokens: 1_000_000, output_tokens: 0, cache_write: 0, cache_read: 0 },              // unpriced
]);
near("aggregate total usd", agg.totals.usd, 1.55);
ok("aggregate call count", agg.totals.calls, 3);
ok("unpriced flagged", agg.totals.unpriced_calls, 1);
ok("perModel sorted by usd desc (opus first)", agg.perModel[0].priceKey, "opus-4.8");

// 6) idempotent append
const tmp = path.join(os.tmpdir(), `ledger-proof-${process.pid}.json`);
try { fs.unlinkSync(tmp); } catch {}
const row: LedgerRow = { id: "x1", ts: "2026-07-01T00:00:00Z", source: "code", cogs: false, sol: "TEST", verdict: "BID", eligible: true, billable: true, perModel: agg.perModel, totals: agg.totals };
appendLedgerRow(row, tmp); appendLedgerRow(row, tmp); // twice → still 1
const led = JSON.parse(fs.readFileSync(tmp, "utf8"));
ok("append idempotent by id", led.rows.length, 1);
appendLedgerRow({ ...row, id: "x2" }, tmp);
ok("distinct id appends", JSON.parse(fs.readFileSync(tmp, "utf8")).rows.length, 2);
try { fs.unlinkSync(tmp); } catch {}

console.log(`cost-ledger proof: ${pass}/${pass + fails.length} pass`);
if (fails.length) { fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — cost math (plain/cache/output/unpriced) · aggregate · idempotent append.");
