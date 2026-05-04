import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
  fetchAgencySpendByNaics,
  fetchDoDTotalAndRecipientsByNaics,
  type RecipientShare
} from "@/lib/usaspending";

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

interface BudgetCacheRow {
  naics_code: string;
  fiscal_year: number;
  total_obligated: number | null;
  top_recipients: RecipientShare[];
  yoy_delta_pct: number | null;
  fetched_at: string;
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
  const sinceIso = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();
  const cacheKey = naicsCodes[0] || null;

  // ━━ Branch 1 · agency-tier breakdown (existing behavior) ━━
  const cacheQ = supabase
    .from("budget_snapshots")
    .select("*")
    .eq("fiscal_year", fy)
    .gte("fetched_at", sinceIso);
  if (cacheKey) cacheQ.eq("naics_code", cacheKey);
  const { data: cached } = await cacheQ;

  let rows: CachedRow[];
  let agencyCached: boolean;
  if (cached && cached.length > 0) {
    rows = cached as CachedRow[];
    agencyCached = true;
  } else {
    const [current, prior] = await Promise.all([
      fetchAgencySpendByNaics({ fiscalYear: fy, naicsCodes, limit: 25 }),
      fetchAgencySpendByNaics({ fiscalYear: fy - 1, naicsCodes, limit: 25 })
    ]);
    const priorMap = new Map(prior.map((r) => [r.agency, r.obligated_amount]));
    rows = current.map((r) => {
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
    if (rows.length > 0) {
      await supabase
        .from("budget_snapshots")
        .upsert(
          rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
          { onConflict: "fiscal_year,agency,naics_code" }
        )
        .then(() => null, () => null);
    }
    agencyCached = false;
  }

  // ━━ Branch 2 · DoD total + top recipients (Prompt 9) ━━
  // Only populated when caller specified a single NAICS — top-recipients
  // aggregation requires a NAICS scope to be meaningful.
  let total_obligated: number | null = null;
  let top_recipients: RecipientShare[] = [];
  let yoy_delta_pct: number | null = null;
  let recipientsCached = false;
  let recipientsFetchedAt: string | null = null;

  if (cacheKey) {
    const { data: cacheRow } = await supabase
      .from("budget_cache")
      .select("*")
      .eq("naics_code", cacheKey)
      .eq("fiscal_year", fy)
      .gte("fetched_at", sinceIso)
      .maybeSingle<BudgetCacheRow>();

    if (cacheRow) {
      total_obligated = cacheRow.total_obligated;
      top_recipients = cacheRow.top_recipients || [];
      yoy_delta_pct = cacheRow.yoy_delta_pct;
      recipientsCached = true;
      recipientsFetchedAt = cacheRow.fetched_at;
    } else {
      const [curr, prev] = await Promise.all([
        fetchDoDTotalAndRecipientsByNaics({ fiscalYear: fy, naicsCode: cacheKey, recipientLimit: 10 }),
        fetchDoDTotalAndRecipientsByNaics({ fiscalYear: fy - 1, naicsCode: cacheKey, recipientLimit: 10 })
      ]);
      total_obligated = curr?.totalObligated ?? null;
      top_recipients = curr?.topRecipients || [];
      const prevTotal = prev?.totalObligated ?? null;
      if (total_obligated && prevTotal && prevTotal > 0) {
        yoy_delta_pct = Number((((total_obligated - prevTotal) / prevTotal) * 100).toFixed(4));
      }
      recipientsFetchedAt = new Date().toISOString();
      // Best-effort persist — fails silently if migration 009 not applied.
      await supabase
        .from("budget_cache")
        .upsert(
          {
            naics_code: cacheKey,
            fiscal_year: fy,
            total_obligated,
            top_recipients,
            yoy_delta_pct,
            fetched_at: recipientsFetchedAt
          },
          { onConflict: "naics_code,fiscal_year" }
        )
        .then(() => null, () => null);
    }
  }

  return NextResponse.json({
    rows,
    cached: agencyCached,
    total_obligated,
    top_recipients,
    yoy_delta_pct,
    fetched_at: recipientsFetchedAt,
    recipients_cached: recipientsCached
  });
}
