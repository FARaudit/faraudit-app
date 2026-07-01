// COST LEDGER — the single source of truth for per-audit-run token cost the cost cockpit reads.
// PURE (no engine imports) so the prod executor can reuse it. Price math mirrors simulate-audit-cost.mjs.
//
// Every audit run (code / ceo / customer) appends ONE row. The cockpit (COST-AUDIT.html + COST-MODEL.html)
// reads the baked inline JSON. `source` tags the run; `cogs` gates whether it feeds per-audit margin
// (delivered customer/ceo audits) vs R&D (engineering/code runs) — a dev run is real spend but NOT COGS.
import fs from "fs";
import path from "path";

// Official 2026 pricing, $ per 1M tokens (input / output). Keyed by canonical family.
export const PRICE: Record<string, { in: number; out: number }> = {
  "opus-4.8":   { in: 5.0, out: 25.0 },
  "sonnet-4.6": { in: 3.0, out: 15.0 },
  "haiku-4.5":  { in: 1.0, out: 5.0 },
};
export const CACHE_WRITE = 1.25; // cache_creation_input_tokens priced at input × 1.25
export const CACHE_READ = 0.10;  // cache_read_input_tokens priced at input × 0.10
const M = 1_000_000;

/** Map any SDK model id (claude-opus-4-8, claude-haiku-4-5-2025…, sonnet-4-6) to a PRICE family. */
export function priceKeyFor(model: string): string | null {
  const m = (model || "").toLowerCase();
  if (m.includes("opus")) return "opus-4.8";
  if (m.includes("sonnet")) return "sonnet-4.6";
  if (m.includes("haiku")) return "haiku-4.5";
  return null;
}

/** One model call's usage, as emitted by setExpertUsageSink / setStructuredUsageSink.
 *  Anthropic semantics: input_tokens = NON-cached input; cache_write/cache_read are separate counters. */
export interface UsageCall { model: string; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; }

export interface PerModelCost { model: string; priceKey: string | null; calls: number; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; usd: number; }

/** $ for one call: plain input @ rate + cache-write @ 1.25× + cache-read @ 0.10× + output @ out-rate. */
export function costForCall(u: UsageCall): number {
  const key = priceKeyFor(u.model);
  if (!key) return 0; // unknown model → 0 here; flagged as unpriced in the aggregate
  const p = PRICE[key];
  return (u.input_tokens / M) * p.in
       + (u.cache_write / M) * p.in * CACHE_WRITE
       + (u.cache_read / M) * p.in * CACHE_READ
       + (u.output_tokens / M) * p.out;
}

export interface Totals { calls: number; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; usd: number; unpriced_calls: number; }

/** Aggregate raw usage calls into per-model rows + grand totals. */
export function aggregate(calls: UsageCall[]): { perModel: PerModelCost[]; totals: Totals } {
  const byKey = new Map<string, PerModelCost>();
  const totals: Totals = { calls: 0, input_tokens: 0, output_tokens: 0, cache_write: 0, cache_read: 0, usd: 0, unpriced_calls: 0 };
  for (const u of calls) {
    const key = priceKeyFor(u.model) ?? `UNPRICED:${u.model}`;
    const usd = costForCall(u);
    if (!priceKeyFor(u.model)) totals.unpriced_calls++;
    const row = byKey.get(key) ?? { model: u.model, priceKey: priceKeyFor(u.model), calls: 0, input_tokens: 0, output_tokens: 0, cache_write: 0, cache_read: 0, usd: 0 };
    row.calls++; row.input_tokens += u.input_tokens; row.output_tokens += u.output_tokens;
    row.cache_write += u.cache_write; row.cache_read += u.cache_read; row.usd += usd;
    byKey.set(key, row);
    totals.calls++; totals.input_tokens += u.input_tokens; totals.output_tokens += u.output_tokens;
    totals.cache_write += u.cache_write; totals.cache_read += u.cache_read; totals.usd += usd;
  }
  return { perModel: [...byKey.values()].sort((a, b) => b.usd - a.usd), totals };
}

export interface LedgerRow {
  id: string;                    // stable run id (idempotency key)
  ts: string;                    // ISO timestamp
  source: "code" | "ceo" | "customer";
  cogs: boolean;                 // feeds per-audit margin? (customer/ceo-delivered = true; code/dev = false = R&D)
  sol: string;
  verdict: string;
  eligible: boolean | null;
  billable: boolean;             // customer charged? (honest-fail no-charge → false)
  perModel: PerModelCost[];
  totals: Totals;
  console_usd?: number | null;   // authoritative Anthropic-side cost if known (else null); token-derived usd is the estimate
  note?: string;
}

export const LEDGER_PATH = path.resolve(process.cwd(), "ceo/cost-ledger.json");

/** Append a row idempotently by id. Creates the ledger if absent. Returns the full ledger. */
export function appendLedgerRow(row: LedgerRow, ledgerPath = LEDGER_PATH): { rows: LedgerRow[] } {
  let led: { rows: LedgerRow[] } = { rows: [] };
  try { if (fs.existsSync(ledgerPath)) led = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { led = { rows: [] }; }
  if (!Array.isArray(led.rows)) led.rows = [];
  if (led.rows.some((r) => r.id === row.id)) return led; // idempotent
  led.rows.push(row);
  fs.writeFileSync(ledgerPath, JSON.stringify(led, null, 2) + "\n");
  return led;
}
