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
// Until that ships this route reports state:"unwired" and the page states it.
//
// It previously answered `_source: "unwired-mock-preserved"`, whose whole purpose
// was to make defense-spending-live.js a no-op so the client-side mock KEPT
// RENDERING — invented agency totals, and named third parties ("Raytheon Intel &
// Space · NAVSEA · $54.2M · May 26") beside dollar figures nobody measured, under a
// green LIVE pill citing FPDS-NG. The contract was literally "preserve the mock".
// Rule 61: a missing dependency is a visible failure state, never sample data. The
// flag now names the condition instead of hiding it.

export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    state: "unwired",
    reason:
      "Federal spending data is not connected to this view yet. Nothing is shown rather than showing figures that were never measured.",
  });
}
