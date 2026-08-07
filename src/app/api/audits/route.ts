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
    // A CALLER'S BAD `limit` IS NOT A SERVER ERROR. parseInt on an absent, non-numeric,
    // zero or negative value yields NaN or <= 0, and supabase-js turns .limit(NaN) and
    // .limit(0) into an unsatisfiable PostgREST Range header — 416, PGRST103
    // "Requested range not satisfiable" — which this route's catch reported as a 500
    // and the ledger rendered as its could-not-load state. Clamp to a usable window,
    // and cap it so one request cannot ask for the whole table.
    const parsedLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 500)
      : 50;
    // Rule 61 — a query failure must surface as a failure (500 → the page's visible
    // error state), never as an empty list a customer reads as "no audits yet."
    const rows = await fetchRecentAudits(supabase, user.id, limit);
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
