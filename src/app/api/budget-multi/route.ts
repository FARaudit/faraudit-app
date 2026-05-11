import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
  fetchAgencySpendByNaics,
  fetchDoDTotalAndRecipientsByNaics,
  type RecipientShare
} from "@/lib/usaspending";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Rolling multi-year Defense Spending view. Drives the 3-year / 5-year toggle
// on the Defense Spending tab. Calls USAspending /spending_by_category for each
// year in parallel (Promise.all). Recipients are deduped via name normalization
// (strip CORPORATION/CORP/INC/LLC/CO suffixes, uppercase, trim) so multi-entity
// primes (e.g. Boeing's 5 sub-entities) consolidate into one row across all years.

interface MultiYearRecipient {
  name: string;
  amounts: Record<number, number>;   // fy -> obligated
  total: number;
  trend: "up" | "down" | "flat";
}

interface MultiYearAgency {
  agency: string;
  amounts: Record<number, number>;
  total: number;
  yoyPct: number | null;             // latest year vs prior
}

// Strip joint-venture / partnership tails before single-word suffixes, so
// "Bell Boeing Joint Project Office" + "Bell-Boeing Joint Project" + "Bell
// Boeing JV" all collapse to "BELL BOEING". Order matters: phrase-level
// patterns must run before the single-word suffix sweep.
const JV_PHRASE_RX = /\b(JOINT\s+PROJECT(\s+OFFICE)?|JOINT\s+VENTURE|JV)\b/gi;
const SUFFIX_RX = /\b(CORPORATION|CORP\.?|INCORPORATED|INC\.?|LLC|L\.L\.C\.?|CO\.?|COMPANY|LTD\.?|LIMITED|HOLDINGS|GROUP|THE)\b/gi;
const PUNCT_RX = /[.,&\-]/g;
function normalizeRecipient(name: string): string {
  return name
    .toUpperCase()
    .replace(JV_PHRASE_RX, "")
    .replace(SUFFIX_RX, "")
    .replace(PUNCT_RX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const naics = url.searchParams.get("naics");  // optional — omit for DoD-wide
  const yearsParam = url.searchParams.get("years");

  // Parse years — default 3-year rolling window ending at current FY. Dedup
  // defensively so a malformed query string can't produce duplicate columns.
  const currentFy = new Date().getFullYear();
  const rawYears = yearsParam
    ? yearsParam.split(",").map((s) => parseInt(s.trim(), 10)).filter((y) => !Number.isNaN(y))
    : [currentFy - 2, currentFy - 1, currentFy];
  const years = Array.from(new Set(rawYears)).sort((a, b) => a - b);

  if (years.length === 0 || years.length > 8) {
    return NextResponse.json({ error: "years must be 1–8 comma-separated fiscal years" }, { status: 400 });
  }

  // ── Parallel fetch: top-recipients + agency-spend for each year ──
  // naics is optional — omit (or empty) for DoD-wide spending across all NAICS.
  const [recipientResults, agencyResults] = await Promise.all([
    Promise.all(years.map((y) => fetchDoDTotalAndRecipientsByNaics({ fiscalYear: y, naicsCode: naics || null, recipientLimit: 25 }))),
    Promise.all(years.map((y) => fetchAgencySpendByNaics({ fiscalYear: y, naicsCodes: naics ? [naics] : undefined, limit: 25 })))
  ]);

  // ── Recipient consolidation ──
  // Map normalized name → { display: prettiest variant we saw, amounts: { fy -> sum } }
  const recipientMap = new Map<string, { display: string; amounts: Record<number, number> }>();
  for (let i = 0; i < years.length; i++) {
    const fy = years[i];
    const result = recipientResults[i];
    if (!result) continue;
    for (const r of result.topRecipients as RecipientShare[]) {
      const norm = normalizeRecipient(r.name);
      if (!norm) continue;
      const existing = recipientMap.get(norm);
      if (existing) {
        existing.amounts[fy] = (existing.amounts[fy] || 0) + r.amount;
        // Prefer the longest display name seen (likely most complete)
        if (r.name.length > existing.display.length) existing.display = r.name;
      } else {
        recipientMap.set(norm, { display: r.name, amounts: { [fy]: r.amount } });
      }
    }
  }

  const latestYear = years[years.length - 1];
  const earliestYear = years[0];

  const recipients: MultiYearRecipient[] = Array.from(recipientMap.values())
    .map((r) => {
      const total = years.reduce((s, y) => s + (r.amounts[y] || 0), 0);
      const latest = r.amounts[latestYear] || 0;
      const earliest = r.amounts[earliestYear] || 0;
      const trend: "up" | "down" | "flat" =
        earliest === 0
          ? (latest > 0 ? "up" : "flat")
          : Math.abs(latest - earliest) / earliest < 0.05
          ? "flat"
          : latest > earliest
          ? "up"
          : "down";
      return { name: r.display, amounts: r.amounts, total, trend };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ── Agency consolidation ──
  // Sum across the agency_spend results by agency name (case-insensitive).
  const agencyMap = new Map<string, { display: string; amounts: Record<number, number> }>();
  for (let i = 0; i < years.length; i++) {
    const fy = years[i];
    const rows = agencyResults[i] || [];
    for (const row of rows) {
      const key = row.agency.toUpperCase().trim();
      const existing = agencyMap.get(key);
      if (existing) {
        existing.amounts[fy] = (existing.amounts[fy] || 0) + row.obligated_amount;
      } else {
        agencyMap.set(key, { display: row.agency, amounts: { [fy]: row.obligated_amount } });
      }
    }
  }

  const agencies: MultiYearAgency[] = Array.from(agencyMap.values())
    .map((a) => {
      const total = years.reduce((s, y) => s + (a.amounts[y] || 0), 0);
      const latest = a.amounts[latestYear] || 0;
      const prev = a.amounts[years[years.length - 2]] || 0;
      const yoyPct = prev > 0 ? ((latest - prev) / prev) * 100 : null;
      return { agency: a.display, amounts: a.amounts, total, yoyPct };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  return NextResponse.json({
    years,
    naics,
    recipients,
    agencies,
    fetched_at: new Date().toISOString()
  });
}
