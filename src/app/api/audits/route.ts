import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchRecentAudits } from "@/lib/bd-os/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");
    const audits = await fetchRecentAudits(supabase, limit).catch(() => []);
    return NextResponse.json({ audits });
  } catch (err) {
    console.error("[api/audits]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
