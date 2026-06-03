import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Fork B architecture wiring for /defense-agencies.
//
// TODO: fetchAgencyOrgMap(supabase, userNaics[]) — derive hierarchical
// {DEPTS, SETASIDES, POSTURE, FORECAST, NAICS_COLORS, SORTS} from
// defense_spending_intel.agency_breakdown (per-NAICS × agency). Needs a
// parent→child agency taxonomy (either new defense_agencies_hierarchy
// migration or static lookup in queries.ts). Posture and quarterly forecast
// need additional aggregation. Until that ships, this route returns
// `_source: "unwired-mock-preserved"` so agencies-live.js leaves the
// client-side dag-data.js mock intact.

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ _source: "unwired-mock-preserved" });
}
