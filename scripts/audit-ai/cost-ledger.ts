// COST LEDGER (local/code-run side) — appends one row per run to ceo/cost-ledger.json, which the cost cockpit
// reads (via bake-cost-ledger.mjs). The COST MATH lives in src/lib/audit-cost.ts (ONE source of truth, shared
// with the prod executor's recordAuditCost) and is re-exported here for existing callers.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
export { PRICE, CACHE_WRITE, CACHE_READ, priceKeyFor, costForCall, aggregate } from "../../src/lib/audit-cost";
export type { UsageCall, PerModelCost, Totals } from "../../src/lib/audit-cost";
import type { PerModelCost, Totals } from "../../src/lib/audit-cost";

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
  // AUTO-LINK: re-bake the cost views so a new row propagates to the cockpit with zero manual steps.
  // Best-effort — a bake failure must never break recording. The idempotent early-return above skips duplicates.
  try {
    const baker = path.join(path.dirname(ledgerPath), "bake-cost-ledger.mjs");
    if (fs.existsSync(baker)) execFileSync("node", [baker], { stdio: "ignore" });
  } catch {
    /* bake is best-effort; the recorded row is still authoritative */
  }
  return led;
}
