import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchAgencyStats } from "@/lib/bd-os/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const agencies = await fetchAgencyStats(supabase).catch(() => []);
    return NextResponse.json({ agencies });
  } catch (err) {
    console.error("[api/agencies]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
