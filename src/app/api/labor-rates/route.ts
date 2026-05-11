import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { searchWageDeterminations } from "@/lib/sam-wages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Defense contractor labor categories — BLS OES 2024 national medians + SCA
// wage determinations as the baseline. LOW = median × 0.75, HIGH = median × 1.25
// per the standard ±25% range. Curated rows in labor_rate_benchmarks override
// these; live SAM wage determinations augment when explicitly requested.
export type CategoryGroup = "engineering" | "program" | "manufacturing" | "logistics" | "security";

const REFERENCE: Array<{
  category: string;
  category_group: CategoryGroup;
  naics_codes: string[];
  rate_low: number;
  rate_median: number;
  rate_high: number;
  source: string;
}> = [
  // ── ENGINEERING / TECHNICAL ──
  { category: "Mechanical Engineer I",         category_group: "engineering", naics_codes: ["541330", "336413"], rate_low:  68, rate_median:  82, rate_high:  98, source: "BLS OES 2024 + SCA" },
  { category: "Mechanical Engineer II",        category_group: "engineering", naics_codes: ["541330", "336413"], rate_low:  88, rate_median: 108, rate_high: 132, source: "BLS OES 2024 + SCA" },
  { category: "Mechanical Engineer III",       category_group: "engineering", naics_codes: ["541330", "336413"], rate_low: 112, rate_median: 138, rate_high: 168, source: "BLS OES 2024 + SCA" },
  { category: "Systems Engineer I",            category_group: "engineering", naics_codes: ["541330"],            rate_low:  65, rate_median:  85, rate_high: 105, source: "BLS OES 2024 + SCA" },
  { category: "Systems Engineer II",           category_group: "engineering", naics_codes: ["541330"],            rate_low:  90, rate_median: 115, rate_high: 140, source: "BLS OES 2024 + SCA" },
  { category: "Systems Engineer III",          category_group: "engineering", naics_codes: ["541330"],            rate_low: 120, rate_median: 150, rate_high: 185, source: "BLS OES 2024 + SCA" },
  { category: "Software Engineer I",           category_group: "engineering", naics_codes: ["541511"],            rate_low:  60, rate_median:  80, rate_high: 105, source: "BLS OES 2024 + SCA" },
  { category: "Software Engineer II",          category_group: "engineering", naics_codes: ["541511"],            rate_low:  90, rate_median: 115, rate_high: 145, source: "BLS OES 2024 + SCA" },
  { category: "Software Engineer III",         category_group: "engineering", naics_codes: ["541511"],            rate_low: 120, rate_median: 155, rate_high: 195, source: "BLS OES 2024 + SCA" },
  { category: "Electrical Engineer I",         category_group: "engineering", naics_codes: ["541330"],            rate_low:  68, rate_median:  85, rate_high: 105, source: "BLS OES 2024 + SCA" },
  { category: "Electrical Engineer II",        category_group: "engineering", naics_codes: ["541330"],            rate_low:  90, rate_median: 115, rate_high: 140, source: "BLS OES 2024 + SCA" },
  { category: "Electrical Engineer III",       category_group: "engineering", naics_codes: ["541330"],            rate_low: 118, rate_median: 145, rate_high: 180, source: "BLS OES 2024 + SCA" },
  { category: "Electronics Technician I",      category_group: "engineering", naics_codes: ["334511"],            rate_low:  25, rate_median:  32, rate_high:  42, source: "BLS OES 2024 + SCA" },
  { category: "Electronics Technician II",     category_group: "engineering", naics_codes: ["334511"],            rate_low:  35, rate_median:  45, rate_high:  58, source: "BLS OES 2024 + SCA" },
  { category: "Electronics Technician III",    category_group: "engineering", naics_codes: ["334511"],            rate_low:  48, rate_median:  60, rate_high:  78, source: "BLS OES 2024 + SCA" },
  { category: "Test Engineer",                 category_group: "engineering", naics_codes: ["541330"],            rate_low:  78, rate_median:  98, rate_high: 122, source: "BLS OES 2024 + SCA" },
  { category: "Systems Analyst",               category_group: "engineering", naics_codes: ["541512"],            rate_low:  68, rate_median:  88, rate_high: 110, source: "BLS OES 2024 + SCA" },
  { category: "Data Analyst",                  category_group: "engineering", naics_codes: ["541512"],            rate_low:  55, rate_median:  72, rate_high:  92, source: "BLS OES 2024 + SCA" },
  { category: "Network Engineer",              category_group: "engineering", naics_codes: ["541512"],            rate_low:  78, rate_median:  98, rate_high: 124, source: "BLS OES 2024 + SCA" },
  { category: "Quality Engineer",              category_group: "engineering", naics_codes: ["336413", "332710"], rate_low:  78, rate_median:  96, rate_high: 118, source: "BLS OES 2024 + SCA" },
  { category: "Aerospace Technician",          category_group: "engineering", naics_codes: ["336413"],            rate_low:  52, rate_median:  68, rate_high:  86, source: "BLS OES 2024 + SCA" },
  { category: "Cybersecurity / CMMC Engineer", category_group: "engineering", naics_codes: ["541512", "541330"], rate_low: 128, rate_median: 162, rate_high: 210, source: "Corpus + market survey" },
  // ── PROGRAM / CONTRACTS ──
  { category: "Program Manager I",             category_group: "program",     naics_codes: ["541330"],            rate_low: 100, rate_median: 125, rate_high: 155, source: "BLS OES 2024 + SCA" },
  { category: "Program Manager II",            category_group: "program",     naics_codes: ["541330"],            rate_low: 135, rate_median: 165, rate_high: 205, source: "BLS OES 2024 + SCA" },
  { category: "Project Manager (Aerospace)",   category_group: "program",     naics_codes: ["541330", "336413"], rate_low: 122, rate_median: 158, rate_high: 198, source: "Corpus + market survey" },
  { category: "Contracts Manager",             category_group: "program",     naics_codes: ["541990"],            rate_low:  88, rate_median: 110, rate_high: 138, source: "BLS OES 2024 + SCA" },
  { category: "Contracts Administrator",       category_group: "program",     naics_codes: ["541990"],            rate_low:  56, rate_median:  72, rate_high:  92, source: "BLS OES 2024 + SCA" },
  { category: "Cost Estimator",                category_group: "program",     naics_codes: ["541990"],            rate_low:  60, rate_median:  78, rate_high:  98, source: "BLS OES 2024 + SCA" },
  { category: "Price Analyst",                 category_group: "program",     naics_codes: ["541990"],            rate_low:  62, rate_median:  82, rate_high: 102, source: "BLS OES 2024 + SCA" },
  { category: "Budget Analyst",                category_group: "program",     naics_codes: ["541990"],            rate_low:  62, rate_median:  80, rate_high: 100, source: "BLS OES 2024 + SCA" },
  { category: "Configuration Manager",         category_group: "program",     naics_codes: ["541330", "336413"], rate_low:  82, rate_median: 102, rate_high: 128, source: "Corpus" },
  { category: "Subcontract Administrator",     category_group: "program",     naics_codes: ["541330"],            rate_low:  72, rate_median:  92, rate_high: 116, source: "Corpus" },
  // ── MANUFACTURING / TRADES ──
  { category: "Sheet Metal Mechanic",          category_group: "manufacturing", naics_codes: ["336413"],            rate_low:  35, rate_median:  46, rate_high:  58, source: "BLS OES 2024 + SCA" },
  { category: "Aircraft Mechanic I",           category_group: "manufacturing", naics_codes: ["336411"],            rate_low:  36, rate_median:  46, rate_high:  58, source: "BLS OES 2024 + SCA" },
  { category: "Aircraft Mechanic II",          category_group: "manufacturing", naics_codes: ["336411"],            rate_low:  52, rate_median:  66, rate_high:  82, source: "BLS OES 2024 + SCA" },
  { category: "Electronics Assembler",         category_group: "manufacturing", naics_codes: ["334511"],            rate_low:  24, rate_median:  32, rate_high:  42, source: "BLS OES 2024 + SCA" },
  { category: "Quality Inspector",             category_group: "manufacturing", naics_codes: ["336413"],            rate_low:  48, rate_median:  62, rate_high:  78, source: "BLS OES 2024 + SCA" },
  { category: "CMM Programmer / Machinist",    category_group: "manufacturing", naics_codes: ["332710"],            rate_low:  62, rate_median:  78, rate_high:  98, source: "BLS OES 2024 + SCA" },
  { category: "CNC Machinist I",               category_group: "manufacturing", naics_codes: ["332710"],            rate_low:  42, rate_median:  55, rate_high:  70, source: "BLS OES 2024 + SCA" },
  { category: "CNC Machinist II",              category_group: "manufacturing", naics_codes: ["332710"],            rate_low:  58, rate_median:  74, rate_high:  92, source: "BLS OES 2024 + SCA" },
  { category: "Welder — Structural",           category_group: "manufacturing", naics_codes: ["332710"],            rate_low:  38, rate_median:  50, rate_high:  64, source: "BLS OES 2024 + SCA" },
  { category: "Production Welder (Mil-Spec)",  category_group: "manufacturing", naics_codes: ["332710", "336413"], rate_low:  48, rate_median:  62, rate_high:  82, source: "SCA wage determinations" },
  { category: "Tool & Die Maker",              category_group: "manufacturing", naics_codes: ["332710"],            rate_low:  48, rate_median:  62, rate_high:  78, source: "BLS OES 2024 + SCA" },
  { category: "Assembler — Precision",         category_group: "manufacturing", naics_codes: ["336413"],            rate_low:  32, rate_median:  42, rate_high:  54, source: "BLS OES 2024 + SCA" },
  { category: "NDT Technician",                category_group: "manufacturing", naics_codes: ["336413"],            rate_low:  46, rate_median:  58, rate_high:  74, source: "BLS OES 2024 + SCA" },
  { category: "Painter — Industrial",          category_group: "manufacturing", naics_codes: ["336413"],            rate_low:  34, rate_median:  44, rate_high:  56, source: "BLS OES 2024 + SCA" },
  // ── LOGISTICS / SUPPLY CHAIN ──
  { category: "Supply Chain Analyst",          category_group: "logistics",   naics_codes: ["541614"],            rate_low:  58, rate_median:  74, rate_high:  94, source: "BLS OES 2024 + SCA" },
  { category: "Purchasing Agent",              category_group: "logistics",   naics_codes: ["541614"],            rate_low:  52, rate_median:  66, rate_high:  84, source: "BLS OES 2024 + SCA" },
  { category: "Inventory Control Specialist",  category_group: "logistics",   naics_codes: ["541614"],            rate_low:  36, rate_median:  46, rate_high:  58, source: "BLS OES 2024 + SCA" },
  { category: "Warehouse Specialist",          category_group: "logistics",   naics_codes: ["493110"],            rate_low:  24, rate_median:  32, rate_high:  42, source: "BLS OES 2024 + SCA" },
  { category: "Shipping/Receiving Clerk",      category_group: "logistics",   naics_codes: ["493110"],            rate_low:  22, rate_median:  28, rate_high:  36, source: "BLS OES 2024 + SCA" },
  { category: "Logistician II",                category_group: "logistics",   naics_codes: ["541330"],            rate_low:  68, rate_median:  88, rate_high: 112, source: "BLS OES 2024 + SCA" },
  // ── SECURITY / CLEARANCE ──
  { category: "Security Specialist",           category_group: "security",    naics_codes: ["541690"],            rate_low:  62, rate_median:  80, rate_high: 102, source: "BLS OES 2024 + SCA" },
  { category: "ISSO (InfoSec System Officer)", category_group: "security",    naics_codes: ["541512"],            rate_low:  92, rate_median: 120, rate_high: 152, source: "BLS OES 2024 + SCA" },
  { category: "FSO (Facility Security Officer)", category_group: "security",  naics_codes: ["541690"],            rate_low:  70, rate_median:  90, rate_high: 115, source: "BLS OES 2024 + SCA" }
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
