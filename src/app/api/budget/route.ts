import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchAgencySpendByNaics } from "@/lib/usaspending";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_HOURS = 24;

interface CachedRow {
  fiscal_year: number;
  agency: string;
  naics_code: string | null;
  obligated_amount: number;
  prior_year_amount: number | null;
  delta_pct: number | null;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const fyParam = url.searchParams.get("fy");
  const naicsParam = url.searchParams.get("naics") || "";
  const naicsCodes = naicsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const fy = fyParam ? Number(fyParam) : new Date().getFullYear();

  // Fast path: serve from cache when fresh.
  const sinceIso = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();
  const cacheKey = naicsCodes[0] || null;
  const cacheQ = supabase
    .from("budget_snapshots")
    .select("*")
    .eq("fiscal_year", fy)
    .gte("fetched_at", sinceIso);
  if (cacheKey) cacheQ.eq("naics_code", cacheKey);
  const { data: cached } = await cacheQ;
  if (cached && cached.length > 0) {
    return NextResponse.json({ rows: cached as CachedRow[], cached: true });
  }

  // Cache miss → live USAspending fetch.
  const [current, prior] = await Promise.all([
    fetchAgencySpendByNaics({ fiscalYear: fy, naicsCodes, limit: 25 }),
    fetchAgencySpendByNaics({ fiscalYear: fy - 1, naicsCodes, limit: 25 })
  ]);
  const priorMap = new Map(prior.map((r) => [r.agency, r.obligated_amount]));

  const rows: CachedRow[] = current.map((r) => {
    const priorAmt = priorMap.get(r.agency) ?? null;
    const deltaPct = priorAmt && priorAmt > 0
      ? Number((((r.obligated_amount - priorAmt) / priorAmt) * 100).toFixed(2))
      : null;
    return {
      fiscal_year: fy,
      agency: r.agency,
      naics_code: cacheKey,
      obligated_amount: r.obligated_amount,
      prior_year_amount: priorAmt,
      delta_pct: deltaPct
    };
  });

  // Persist (best-effort — fails silently if migration not applied).
  if (rows.length > 0) {
    await supabase
      .from("budget_snapshots")
      .upsert(
        rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
        { onConflict: "fiscal_year,agency,naics_code" }
      )
      .then(() => null, () => null);
  }

  return NextResponse.json({ rows, cached: false });
}
