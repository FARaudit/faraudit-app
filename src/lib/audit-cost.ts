// Canonical per-run audit cost math (PURE, no deps). ONE source of truth for the price table — the prod
// executor (recordAuditCost) AND the local scripts/audit-ai/cost-ledger.ts both import from here so pricing
// never drifts. Mirrors the model in simulate-audit-cost.mjs.

// Official 2026 pricing, $ per 1M tokens (input / output), keyed by canonical family.
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

/** One model call's usage. Anthropic semantics: input_tokens = NON-cached input; cache_* are separate counters. */
export interface UsageCall { model: string; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; }
export interface PerModelCost { model: string; priceKey: string | null; calls: number; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; usd: number; }
export interface Totals { calls: number; input_tokens: number; output_tokens: number; cache_write: number; cache_read: number; usd: number; unpriced_calls: number; }

/** $ for one call: plain input @ rate + cache-write @ 1.25× + cache-read @ 0.10× + output @ out-rate. */
export function costForCall(u: UsageCall): number {
  const key = priceKeyFor(u.model);
  if (!key) return 0; // unknown model → 0; flagged as unpriced in the aggregate
  const p = PRICE[key];
  return (u.input_tokens / M) * p.in
       + (u.cache_write / M) * p.in * CACHE_WRITE
       + (u.cache_read / M) * p.in * CACHE_READ
       + (u.output_tokens / M) * p.out;
}

/** Aggregate raw usage calls into per-model rows + grand totals. */
export function aggregate(calls: UsageCall[]): { perModel: PerModelCost[]; totals: Totals } {
  const byKey = new Map<string, PerModelCost>();
  const totals: Totals = { calls: 0, input_tokens: 0, output_tokens: 0, cache_write: 0, cache_read: 0, usd: 0, unpriced_calls: 0 };
  for (const u of calls) {
    const pk = priceKeyFor(u.model);
    const key = pk ?? `UNPRICED:${u.model}`;
    const usd = costForCall(u);
    if (!pk) totals.unpriced_calls++;
    const row = byKey.get(key) ?? { model: u.model, priceKey: pk, calls: 0, input_tokens: 0, output_tokens: 0, cache_write: 0, cache_read: 0, usd: 0 };
    row.calls++; row.input_tokens += u.input_tokens; row.output_tokens += u.output_tokens;
    row.cache_write += u.cache_write; row.cache_read += u.cache_read; row.usd += usd;
    byKey.set(key, row);
    totals.calls++; totals.input_tokens += u.input_tokens; totals.output_tokens += u.output_tokens;
    totals.cache_write += u.cache_write; totals.cache_read += u.cache_read; totals.usd += usd;
  }
  return { perModel: [...byKey.values()].sort((a, b) => b.usd - a.usd), totals };
}
