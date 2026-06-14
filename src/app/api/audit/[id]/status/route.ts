// FA-116 — GET /api/audit/[id]/status
// Poll target for async-enqueued audits. Reads under the caller's RLS
// session, so a user can only see status for audits they own. Returns the
// minimum the HomeClient poller needs: status to branch on, error_message
// for the failed state, solicitationNumber for the redirect slug.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: audit, error } = await supabase
    .from("audits")
    .select("id, status, current_stage, stage_updated_at, error_message, solicitation_number")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  if (!audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  return NextResponse.json({
    auditId: audit.id,
    status: audit.status,
    current_stage: audit.current_stage ?? null,
    error_message: audit.error_message ?? null,
    solicitationNumber: audit.solicitation_number ?? null
  });
}
