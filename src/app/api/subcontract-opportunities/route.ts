import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface SubcontractRow {
  prime_uei: string | null;
  prime_name: string;
  contract_value: number | null;
  naics_code: string | null;
  agency: string | null;
  set_aside_required: string | null;
  sblo_name: string | null;
  sblo_email: string | null;
  sblo_phone: string | null;
  expiration: string | null;
  source_url: string | null;
  notes: string | null;
}

// USAspending's spending_by_award/ returns prime contracts. We fetch large
// awards (>$2M) under the requested NAICS, filter to those whose recipient
// likely has a subcontracting plan (prime contractors over the simplified
// acquisition threshold are required to have one), and surface as opportunities.
//
// SBLO contact details are not in the public data — operator-curated rows in
// the subcontract_opportunities table override anything we synthesize.

interface USASpendingAwardResultRow {
  Recipient?: { recipient_name?: string | null; uei?: string | null };
  recipient_name?: string | null;
  "Recipient Name"?: string | null;
  "Award Amount"?: number | null;
  total_obligation?: number | null;
  "Period of Performance Current End Date"?: string | null;
  period_of_performance_current_end_date?: string | null;
  "Awarding Agency"?: string | null;
  awarding_agency_name?: string | null;
  "Award ID"?: string | null;
  generated_internal_id?: string | null;
}

async function fetchPrimes(naics: string, agencyKeyword: string | null): Promise<SubcontractRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);

  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"],
    naics_codes: [naics],
    award_amounts: [{ lower_bound: 2_000_000 }],
    time_period: [{ start_date: sixMonthsAgo, end_date: today }]
  };
  if (agencyKeyword) {
    filters.agencies = [{ type: "awarding", tier: "toptier", name: agencyKeyword }];
  }

  const body = {
    filters,
    fields: ["Award ID", "Recipient Name", "Award Amount", "Period of Performance Current End Date", "Awarding Agency"],
    page: 1,
    limit: 50,
    sort: "Period of Performance Current End Date",
    order: "desc",
    subawards: false
  };

  let res: Response;
  try {
    res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch { return []; }
  if (!res.ok) return [];

  let data: { results?: USASpendingAwardResultRow[] } = {};
  try { data = await res.json(); } catch { return []; }
  const rows = data.results || [];

  return rows.map((r) => ({
    prime_uei: r.Recipient?.uei || null,
    prime_name: r.Recipient?.recipient_name || r["Recipient Name"] || r.recipient_name || "—",
    contract_value: typeof r["Award Amount"] === "number" ? Math.round(r["Award Amount"] as number) : null,
    naics_code: naics,
    agency: r["Awarding Agency"] || r.awarding_agency_name || null,
    set_aside_required: null,
    sblo_name: null,
    sblo_email: null,
    sblo_phone: null,
    expiration: r["Period of Performance Current End Date"] || r.period_of_performance_current_end_date || null,
    source_url: r["Award ID"] || r.generated_internal_id ? `https://usaspending.gov/award/${r["Award ID"] || r.generated_internal_id}` : null,
    notes: "Synthesized from USAspending prime award · SBLO contact not public · use SAM.gov entity lookup for vendor contact"
  }));
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const naics = url.searchParams.get("naics");
  const agency = url.searchParams.get("agency");
  if (!naics) return NextResponse.json({ error: "naics required" }, { status: 400 });

  // Operator-curated cache merge.
  const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: cached } = await supabase
    .from("subcontract_opportunities")
    .select("*")
    .eq("naics_code", naics)
    .gte("fetched_at", sinceIso)
    .order("expiration", { ascending: true, nullsFirst: false })
    .limit(50);

  if (cached && cached.length > 5) {
    return NextResponse.json({ opportunities: cached, cached: true });
  }

  const synth = await fetchPrimes(naics, agency);

  // Persist (best-effort).
  if (synth.length > 0) {
    await supabase
      .from("subcontract_opportunities")
      .upsert(
        synth.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
        { onConflict: "prime_uei,naics_code,expiration" }
      )
      .then(() => null, () => null);
  }

  return NextResponse.json({ opportunities: synth, cached: false });
}
