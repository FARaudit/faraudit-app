import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveCustomerNaics } from "@/lib/customer-naics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAM_API_KEY = process.env.SAM_API_KEY || "";

const DEMO_OPPORTUNITIES = [
  {
    id: "DEMO-001",
    title: "Machined Aluminum Components for F-35 Program",
    agency: "Department of Defense — Lockheed Martin Corp",
    naics: "336413",
    type: "Solicitation",
    postedDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    responseDeadline: new Date(Date.now() + 14 * 86400000).toISOString(),
    setAside: "Total Small Business",
    solicitationNumber: "DEMO-FA3016-26-Q-XXXX",
    description: "This is demo data. Add SAM_API_KEY to see live solicitations.",
    uiLink: "https://sam.gov"
  },
  {
    id: "DEMO-002",
    title: "CNC Precision Parts for T-38 Talon Trainer",
    agency: "Air Force Materiel Command",
    naics: "336413",
    type: "Solicitation",
    postedDate: new Date(Date.now() - 1 * 86400000).toISOString(),
    responseDeadline: new Date(Date.now() + 21 * 86400000).toISOString(),
    setAside: "Total Small Business",
    solicitationNumber: "DEMO-FA3016-26-Q-YYYY",
    description: "Sample solicitation for CNC machined parts for T-38 Talon trainer aircraft maintenance.",
    uiLink: "https://sam.gov"
  }
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const explicitNaics = searchParams.get("naics");
  const limit = searchParams.get("limit") || "10";

  if (!SAM_API_KEY) {
    return NextResponse.json({
      source: "demo",
      notice: "Add SAM_API_KEY environment variable to enable live feed. Register free at open.gsa.gov/api/get-opportunities-public-api/",
      opportunities: DEMO_OPPORTUNITIES
    });
  }

  // NAICS source: an explicit ?naics= override (e.g. public preview) wins; else
  // the signed-in customer's saved/seeded codes. No hardcoded preset fallback
  // (Brain ruling 2026-06-25 — option a primary, option c fallback).
  let naics: string[] = [];
  if (explicitNaics) {
    naics = explicitNaics.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) naics = (await resolveCustomerNaics(sb, user.id)).naics;
  }
  if (naics.length === 0) {
    return NextResponse.json({ source: "live", total: 0, opportunities: [], needsNaicsConfig: !explicitNaics });
  }

  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0].replace(/-/g, "");

    // URLSearchParams (not raw interpolation) so customer-supplied naics/limit
    // can't smuggle extra query params into the SAM request. limit is clamped.
    const samParams = new URLSearchParams({
      api_key: SAM_API_KEY,
      naicsCode: naics.join(","),
      limit: String(Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)),
      postedFrom: dateStr,
      active: "Yes",
      setAside: "SBA"
    });
    // sam.gov/api/prod, NOT api.sam.gov (the latter 404s).
    const url = `https://sam.gov/api/prod/opportunities/v2/search?${samParams.toString()}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`SAM.gov API error: ${res.status}`);
    const data = await res.json();

    type SamOpportunity = {
      noticeId: string;
      title: string;
      fullParentPathName?: string;
      organizationHierarchy?: { name?: string }[];
      naicsCode?: string;
      type?: string;
      postedDate?: string;
      responseDeadLine?: string;
      typeOfSetAside?: string;
      solicitationNumber?: string;
      description?: string;
      uiLink?: string;
    };

    const opportunities = (data.opportunitiesData || []).map((opp: SamOpportunity) => ({
      id: opp.noticeId,
      title: opp.title,
      agency: opp.fullParentPathName || opp.organizationHierarchy?.[0]?.name,
      naics: opp.naicsCode,
      type: opp.type,
      postedDate: opp.postedDate,
      responseDeadline: opp.responseDeadLine,
      setAside: opp.typeOfSetAside,
      solicitationNumber: opp.solicitationNumber,
      description: opp.description?.substring(0, 300),
      uiLink: opp.uiLink
    }));

    return NextResponse.json({ source: "live", total: data.totalRecords, opportunities });
  } catch (err) {
    // Log server-side only — the raw error can contain the key-bearing request URL.
    console.warn("[sam] fetch error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ source: "error", error: "SAM.gov request failed", opportunities: DEMO_OPPORTUNITIES });
  }
}
