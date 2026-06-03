import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Fork B architecture wiring for /defense-spending.
//
// TODO: fetchDefenseSpendingFull(supabase, userNaics[]) — map
// defense_spending_intel JSONB cols (state_breakdown, agency_breakdown,
// recompetes_expiring_180d, top_recipients, sb_pct, yoy_delta_pct) into the
// full window.DSB shape: {FYS, KPIS, STATES, AGENCIES, COMPETITION,
// MARKET_TREND, BUDGET, RECOMPETES, INCUMBENTS, PRICING, NDAA, AGENCY_FILTERS}.
// Until that ships, this route returns `_source: "unwired-mock-preserved"`
// so defense-spending-live.js leaves the client-side dsb-data.js mock intact.

export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ _source: "unwired-mock-preserved" });
}
