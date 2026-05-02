import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const BASE = "https://api.congress.gov/v3";

interface CongressBillRaw {
  congress: number;
  type: string;
  number: string | number;
  title?: string;
  sponsors?: Array<{ fullName?: string; party?: string }>;
  introducedDate?: string;
  latestAction?: { actionDate?: string; text?: string };
  url?: string;
}

interface CongressBillRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string | null;
  sponsor_name: string | null;
  sponsor_party: string | null;
  introduced_date: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  is_ndaa: boolean;
  is_appropriations: boolean;
  defense_focus: boolean;
  url: string | null;
}

const NDAA_RX = /\bnational defense authorization\b/i;
const APPROP_RX = /\bappropriations\b/i;
const DEFENSE_RX = /\b(defense|department of defense|dod|armed forces|military)\b/i;

function classify(title: string | undefined): { is_ndaa: boolean; is_appropriations: boolean; defense_focus: boolean } {
  const t = title || "";
  return {
    is_ndaa: NDAA_RX.test(t),
    is_appropriations: APPROP_RX.test(t),
    defense_focus: DEFENSE_RX.test(t)
  };
}

async function fetchBills(congress: number, billType: string, apiKey: string): Promise<CongressBillRow[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    format: "json",
    limit: "75",
    offset: "0",
    sort: "updateDate+desc"
  });
  let res: Response;
  try {
    res = await fetch(`${BASE}/bill/${congress}/${billType}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
  } catch { return []; }
  if (!res.ok) return [];

  let data: { bills?: CongressBillRaw[] } = {};
  try { data = await res.json(); } catch { return []; }
  const list = data.bills || [];

  return list
    .map((b) => {
      const tags = classify(b.title);
      const number = typeof b.number === "number" ? b.number : parseInt(String(b.number), 10);
      if (!isFinite(number)) return null;
      return {
        congress: b.congress,
        bill_type: b.type.toLowerCase(),
        bill_number: number,
        title: b.title ?? null,
        sponsor_name: b.sponsors?.[0]?.fullName ?? null,
        sponsor_party: b.sponsors?.[0]?.party ?? null,
        introduced_date: b.introducedDate ?? null,
        latest_action_date: b.latestAction?.actionDate ?? null,
        latest_action_text: b.latestAction?.text ?? null,
        url: b.url ?? null,
        ...tags
      } satisfies CongressBillRow;
    })
    .filter((r): r is CongressBillRow => r !== null);
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || ""; // 'ndaa' | 'appropriations' | 'defense' | ''

  // Cache hit — 12h freshness.
  const sinceIso = new Date(Date.now() - 12 * 3600_000).toISOString();
  let cacheQ = supabase
    .from("congressional_bills")
    .select("*")
    .gte("fetched_at", sinceIso)
    .order("latest_action_date", { ascending: false, nullsFirst: false })
    .limit(150);
  if (filter === "ndaa")           cacheQ = cacheQ.eq("is_ndaa", true);
  if (filter === "appropriations") cacheQ = cacheQ.eq("is_appropriations", true);
  if (filter === "defense")        cacheQ = cacheQ.eq("defense_focus", true);
  const { data: cached } = await cacheQ;

  if (cached && cached.length > 5) {
    return NextResponse.json({ bills: cached, cached: true });
  }

  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      bills: cached || [],
      cached: false,
      reason: "CONGRESS_API_KEY not configured — register at api.congress.gov for free key"
    });
  }

  const congress = 119; // 119th Congress = 2025-2027
  // Pull both H.R. and S. bills in parallel.
  const [hr, s] = await Promise.all([
    fetchBills(congress, "hr", apiKey),
    fetchBills(congress, "s",  apiKey)
  ]);
  const bills = [...hr, ...s];

  if (bills.length > 0) {
    await supabase
      .from("congressional_bills")
      .upsert(
        bills.map((b) => ({ ...b, fetched_at: new Date().toISOString() })),
        { onConflict: "congress,bill_type,bill_number" }
      )
      .then(() => null, () => null);
  }

  // Apply filter to live results.
  let visible = bills;
  if (filter === "ndaa")           visible = bills.filter((b) => b.is_ndaa);
  if (filter === "appropriations") visible = bills.filter((b) => b.is_appropriations);
  if (filter === "defense")        visible = bills.filter((b) => b.defense_focus);

  return NextResponse.json({
    bills: visible.sort((a, b) =>
      new Date(b.latest_action_date || 0).getTime() - new Date(a.latest_action_date || 0).getTime()
    ),
    cached: false
  });
}
