import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Fork B architecture wiring for /defense-agencies.
//
// TODO: fetchAgencyOrgMap(supabase, userNaics[]) — derive hierarchical
// {DEPTS, SETASIDES, POSTURE, FORECAST} from defense_spending_intel
// .agency_breakdown (per-NAICS × agency). Needs a parent→child agency taxonomy
// (either a defense_agencies_hierarchy migration or a static lookup in
// queries.ts). Posture and quarterly forecast need further aggregation.
//
// Until that ships this route reports state:"unwired" and the page states it,
// which is the same contract /api/defense-spending serves. The previous
// `_source: "unwired-mock-preserved"` flag existed to make agencies-live.js a
// no-op so the client-side seed KEPT RENDERING: obligated dollars per command,
// small-business shares, set-aside posture and a quarterly forecast, none of
// which is measured anywhere in the product. Rule 61 — a missing dependency is
// a visible failure state, never sample data.

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    state: "unwired",
    reason:
      "Agency org and posture data is not connected to this view yet. Nothing is shown rather than showing obligations, set-aside shares and forecasts that were never measured."
  });
}
