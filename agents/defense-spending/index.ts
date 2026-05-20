// Defense Spending Intel — nightly cron worker.
// For each NAICS code, queries USAspending API v2 for FY2026 + FY2025 metrics
// and UPSERTs one row per (naics_code, fiscal_year) into defense_spending_intel.
//
// Env: NAICS_CODES (comma-separated, default "336413") ·
//      NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//
// Schedule (Railway): suggest 0 4 * * * (04:00 UTC = 23:00 prior-day CT) so
// USAspending's daily refresh has settled before we pull. Set as a separate
// Railway service — does NOT modify sam-ingest.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[defense-spending] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Dynamic import after env load so module-level env captures resolve.
// @ts-expect-error tsx
const usaNs: any = await import("./usaspending.ts");
const usa = usaNs.default ?? usaNs;

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NAICS_CODES = (process.env.NAICS_CODES || "336413")
  .split(",").map((s) => s.trim()).filter(Boolean);

// FY definition: fiscal year N = Oct 1 (N-1) through Sep 30 N
// FY2026 = 2025-10-01 → 2026-09-30 (current, in progress)
// FY2025 = 2024-10-01 → 2025-09-30 (closed)
// FY2024 = 2023-10-01 → 2024-09-30 (closed · FA-96b · 3-year trend reference)
interface FYWindow { fy: number; start: string; end: string }
const FY_WINDOWS: FYWindow[] = [
  { fy: 2024, start: "2023-10-01", end: "2024-09-30" },
  { fy: 2025, start: "2024-10-01", end: "2025-09-30" },
  { fy: 2026, start: "2025-10-01", end: "2026-09-30" }
];

interface IntelRow {
  naics_code: string;
  fiscal_year: number;
  total_obligations: number | null;
  sb_obligations: number | null;
  sb_pct: number | null;
  top_recipients: unknown;
  sb_recipients: unknown;          // FA-96b
  agency_breakdown: unknown;
  state_breakdown: unknown;
  contract_type_breakdown: unknown;
  recompetes_expiring_90d: unknown;
  recompetes_expiring_180d: unknown;
  yoy_delta_pct: number | null;
}

async function buildRow(naics: string, win: FYWindow, priorTotal: number | null): Promise<IntelRow> {
  const f = { naics, fyStart: win.start, fyEnd: win.end };
  const [total, sb, recipients, sbRecipients, agencies, states, contractTypes, rec90, rec180] = await Promise.all([
    usa.fetchTotalObligations(f),
    usa.fetchSmallBusinessObligations(f),
    usa.fetchTopRecipients(f),
    usa.fetchSBRecipients(f),       // FA-96b
    usa.fetchAgencyBreakdown(f),
    usa.fetchStateBreakdown(f),
    usa.fetchContractTypeBreakdown(f),
    usa.fetchRecompetes(f, 90),
    usa.fetchRecompetes(f, 180)
  ]);
  const sbPct = total && total > 0 && sb != null ? (sb / total) * 100 : null;
  const yoy = priorTotal != null && priorTotal > 0 && total != null ? ((total - priorTotal) / priorTotal) * 100 : null;
  return {
    naics_code: naics,
    fiscal_year: win.fy,
    total_obligations: total,
    sb_obligations: sb,
    sb_pct: sbPct,
    top_recipients: recipients,
    sb_recipients: sbRecipients,
    agency_breakdown: agencies,
    state_breakdown: states,
    contract_type_breakdown: contractTypes,
    recompetes_expiring_90d: rec90,
    recompetes_expiring_180d: rec180,
    yoy_delta_pct: yoy
  };
}

async function upsert(row: IntelRow): Promise<void> {
  const { error } = await supabase
    .from("defense_spending_intel")
    .upsert(row, { onConflict: "naics_code,fiscal_year" });
  if (error) throw new Error(`upsert ${row.naics_code}/${row.fiscal_year}: ${error.message}`);
}

async function main() {
  const startedAt = new Date();
  console.log(`[defense-spending] started ${startedAt.toISOString()} · NAICS ${NAICS_CODES.join(",")}`);

  for (const naics of NAICS_CODES) {
    console.log(`[defense-spending] processing NAICS ${naics}...`);
    // Process FY2024 → FY2025 → FY2026 sequentially so each year's YoY can
    // reference the prior year's total. FY2024 has no prior reference → yoy=null.
    let priorTotal: number | null = null;
    for (const win of FY_WINDOWS) {
      const row = await buildRow(naics, win, priorTotal);
      await upsert(row);
      const sbCount = Array.isArray(row.sb_recipients) ? row.sb_recipients.length : 0;
      console.log(`  · FY${win.fy}: total=$${(row.total_obligations || 0).toLocaleString()} · sb_pct=${row.sb_pct?.toFixed(1)}% · yoy=${row.yoy_delta_pct?.toFixed(1)}% · sb_recipients=${sbCount}`);
      priorTotal = row.total_obligations;
    }
  }

  console.log(`[defense-spending] done ${new Date().toISOString()} · duration=${Date.now() - startedAt.getTime()}ms`);
}

main().catch((e) => { console.error("[defense-spending] fatal", e); process.exit(1); });
