import { NextResponse } from "next/server";

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
  const naics = searchParams.get("naics") || "336413,332710,332720,332999,334511";
  const limit = searchParams.get("limit") || "10";

  if (!SAM_API_KEY) {
    return NextResponse.json({
      source: "demo",
      notice: "Add SAM_API_KEY environment variable to enable live feed. Register free at open.gsa.gov/api/get-opportunities-public-api/",
      opportunities: DEMO_OPPORTUNITIES
    });
  }

  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0].replace(/-/g, "");

    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${SAM_API_KEY}&naicsCode=${naics}&limit=${limit}&postedFrom=${dateStr}&active=Yes&setAside=SBA`;

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
    return NextResponse.json({ source: "error", error: String(err), opportunities: DEMO_OPPORTUNITIES });
  }
}
