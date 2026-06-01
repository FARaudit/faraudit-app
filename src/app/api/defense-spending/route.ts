import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchDefenseSpending } from "@/lib/bd-os/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const naics = req.nextUrl.searchParams.get("naics") ?? undefined;
    const spending = await fetchDefenseSpending(supabase, naics).catch(() => []);
    return NextResponse.json({ spending });
  } catch (err) {
    console.error("[api/defense-spending]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
