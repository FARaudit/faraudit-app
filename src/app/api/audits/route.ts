import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchRecentAudits } from "@/lib/bd-os/queries";
import { cleanAgencyName } from "@/lib/audit-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");
    const rows = await fetchRecentAudits(supabase, user.id, limit).catch(() => []);
    // FA-167.1 — resolve the buying-office leaf server-side through the SAME
    // cleanAgencyName() the audit report uses (strips the redundant DoD parent),
    // so run-audit.html's static card JS can render the office leaf without
    // bundling the engine. Mirrors the resolution in home/page.tsx.
    const audits = rows.map((a) => ({
      ...a,
      office_display: (a.office_leaf || a.agency)
        ? cleanAgencyName(a.office_leaf || a.agency || "").replace(/\s{2,}/g, " ").trim()
        : ""
    }));
    return NextResponse.json({ audits });
  } catch (err) {
    console.error("[api/audits]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
