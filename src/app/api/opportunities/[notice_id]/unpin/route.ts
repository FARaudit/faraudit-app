// FA-89h — POST /api/opportunities/[notice_id]/unpin
// Reverses a Pipeline pin. Sets pending_audits.in_pipeline=false AND unpins
// only STUB audit rows (audit_source='opportunities_pin'). Real audits that
// the user manually pinned via Past Audits ("+ Pipeline" / FA-93b) are
// preserved — those use audit_source='audit_ai' or 'user' and stay pinned.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ notice_id: string }> }
) {
  const { notice_id } = await ctx.params;
  if (!notice_id) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error: paErr } = await supabase
    .from("pending_audits")
    .update({ in_pipeline: false })
    .eq("notice_id", notice_id);
  if (paErr) return NextResponse.json({ error: `pending_audits unpin failed: ${paErr.message}` }, { status: 503 });

  // Only unpin stub rows. Real audits keep their pinned state — those were
  // explicitly pinned by the user via Past Audits and live independently.
  const { error: auErr } = await supabase
    .from("audits")
    .update({ in_pipeline: false })
    .eq("notice_id", notice_id)
    .eq("audit_source", "opportunities_pin");
  if (auErr) return NextResponse.json({ error: `audits stub unpin failed: ${auErr.message}` }, { status: 503 });

  return NextResponse.json({ ok: true });
}
