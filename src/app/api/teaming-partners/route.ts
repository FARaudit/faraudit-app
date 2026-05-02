import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { searchTeamingPartners } from "@/lib/sam-entity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const naics = url.searchParams.get("naics");
  const state = url.searchParams.get("state");
  const setAside = url.searchParams.get("setAside");

  if (!naics) {
    return NextResponse.json({ error: "naics query param required" }, { status: 400 });
  }

  if (!process.env.SAM_API_KEY) {
    return NextResponse.json({ partners: [], reason: "SAM_API_KEY not configured" }, { status: 200 });
  }

  const partners = await searchTeamingPartners({
    naics,
    state: state || null,
    setAside: setAside || null,
    limit: 25
  });

  return NextResponse.json({ partners });
}
