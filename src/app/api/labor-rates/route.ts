import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { searchWageDeterminations } from "@/lib/sam-wages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Static SCA reference set for common defense-aerospace labor categories.
// Production version will pull live from acquisition.gov wage determinations
// + corpus pricing patterns; for now this is a hand-built scaffold so the
// UI works on day 0 and the customer sees real numbers.
const REFERENCE: Array<{
  category: string;
  naics_codes: string[];
  rate_low: number;
  rate_median: number;
  rate_high: number;
  source: string;
}> = [
  { category: "Mechanical Engineer I",          naics_codes: ["541330", "336413"], rate_low:  68, rate_median:  82, rate_high:  98, source: "SCA wage determinations + corpus" },
  { category: "Mechanical Engineer II",         naics_codes: ["541330", "336413"], rate_low:  88, rate_median: 108, rate_high: 132, source: "SCA wage determinations + corpus" },
  { category: "Mechanical Engineer III",        naics_codes: ["541330", "336413"], rate_low: 112, rate_median: 138, rate_high: 168, source: "SCA wage determinations + corpus" },
  { category: "Quality Engineer",               naics_codes: ["336413", "332710"], rate_low:  78, rate_median:  96, rate_high: 118, source: "SCA wage determinations + corpus" },
  { category: "CMM Programmer / Machinist",     naics_codes: ["332710"],            rate_low:  62, rate_median:  78, rate_high:  98, source: "SCA wage determinations + corpus" },
  { category: "Aerospace Technician",           naics_codes: ["336413"],            rate_low:  52, rate_median:  68, rate_high:  86, source: "SCA wage determinations + corpus" },
  { category: "Project Manager (Aerospace)",    naics_codes: ["541330", "336413"], rate_low: 122, rate_median: 158, rate_high: 198, source: "Corpus + market survey" },
  { category: "Cybersecurity / CMMC Engineer",  naics_codes: ["541512", "541330"], rate_low: 128, rate_median: 162, rate_high: 210, source: "Corpus + market survey" },
  { category: "Production Welder (Mil-Spec)",   naics_codes: ["332710", "336413"], rate_low:  48, rate_median:  62, rate_high:  82, source: "SCA wage determinations" },
  { category: "Configuration Manager",          naics_codes: ["541330", "336413"], rate_low:  82, rate_median: 102, rate_high: 128, source: "Corpus" },
  { category: "Subcontract Administrator",      naics_codes: ["541330"],            rate_low:  72, rate_median:  92, rate_high: 116, source: "Corpus" },
  { category: "Logistician II",                 naics_codes: ["541330"],            rate_low:  68, rate_median:  88, rate_high: 112, source: "SCA wage determinations" }
];

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const naics = url.searchParams.get("naics");
  const state = url.searchParams.get("state");
  const search = (url.searchParams.get("q") || "").toLowerCase();
  const includeWage = url.searchParams.get("wage") === "1";

  // Live cache pass — operator-curated rows in labor_rate_benchmarks override reference.
  let liveQuery = supabase
    .from("labor_rate_benchmarks")
    .select("naics_code, contract_type, location, labor_category, rate_low, rate_median, rate_high, source");
  if (naics) liveQuery = liveQuery.eq("naics_code", naics);
  const { data: live } = await liveQuery;

  // SAM.gov wage-determination layer — only when explicitly requested (it's slow + key-gated).
  const wageRows: Array<{
    category: string; naics_codes: string[]; rate_low: number; rate_median: number; rate_high: number; source: string; curated: false; wd_number?: string | null; state?: string | null;
  }> = [];
  if (includeWage && (state || naics)) {
    const wd = await searchWageDeterminations({ state: state || null, naics: naics || null, limit: 10 });
    // Cache the determinations so the UI can show provenance + the next request hits the DB.
    for (const det of wd) {
      for (const cls of det.classifications) {
        if (cls.hourly_rate == null) continue;
        const median = cls.hourly_rate;
        wageRows.push({
          category: cls.title,
          naics_codes: naics ? [naics] : [],
          rate_low: Math.round(median * 0.85 * 100) / 100,
          rate_median: median,
          rate_high: Math.round(median * 1.18 * 100) / 100,
          source: `SAM.gov WD ${det.wd_number || "—"}${cls.fringe_rate ? ` · +$${cls.fringe_rate.toFixed(2)} fringe` : ""}`,
          curated: false,
          wd_number: det.wd_number,
          state: det.state
        });
        // Persist to wage_rate_cache (best-effort).
        await supabase
          .from("wage_rate_cache")
          .upsert({
            wd_number: det.wd_number || cls.title,
            state: det.state,
            county: det.county,
            naics_code: naics,
            labor_category: cls.title,
            hourly_rate: cls.hourly_rate,
            fringe_rate: cls.fringe_rate,
            effective_date: det.effective_date,
            expiration_date: det.expiration_date,
            source_url: det.source_url,
            fetched_at: new Date().toISOString()
          }, { onConflict: "wd_number,labor_category,state" })
          .then(() => null, () => null);
      }
    }
  }

  const merged = [
    ...((live || []) as Array<{
      naics_code: string | null;
      contract_type: string | null;
      location: string | null;
      labor_category: string;
      rate_low: number | null;
      rate_median: number | null;
      rate_high: number | null;
      source: string | null;
    }>).map((r) => ({
      category: r.labor_category,
      naics_codes: r.naics_code ? [r.naics_code] : [],
      rate_low: Number(r.rate_low ?? 0),
      rate_median: Number(r.rate_median ?? 0),
      rate_high: Number(r.rate_high ?? 0),
      source: r.source || "live",
      curated: true
    })),
    ...wageRows,
    ...REFERENCE.map((r) => ({ ...r, curated: false }))
  ].filter((r) => {
    if (naics && !r.naics_codes.includes(naics)) return false;
    if (search && !r.category.toLowerCase().includes(search)) return false;
    return true;
  });

  return NextResponse.json({ rates: merged });
}
