// FA-89h — POST /api/opportunities/[notice_id]/pin
// Pins an opportunity into the Pipeline Kanban. Flips pending_audits.in_pipeline=true
// AND ensures a corresponding audits row exists with in_pipeline=true so the Kanban
// can render it. If an audits row already exists (real audit or prior stub), updates
// the flag in place. If none exists, inserts a stub row with audit_source='opportunities_pin'
// and status='pending' so the Kanban filter at HomeClient.tsx:2011 admits it via the
// (audit_source === 'opportunities_pin') branch alongside real audits.

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

  // Step 1: load the pending_audits row so we can copy its display fields into
  // the stub audit. We rely on the pending row existing; if it doesn't, this
  // notice_id was either never ingested or has been purged — return 404.
  const { data: pa, error: paErr } = await supabase
    .from("pending_audits")
    .select("notice_id, solicitation_number, title, agency, naics_code, set_aside, response_deadline")
    .eq("notice_id", notice_id)
    .maybeSingle();
  if (paErr) return NextResponse.json({ error: `pending_audits load failed: ${paErr.message}` }, { status: 503 });
  if (!pa)   return NextResponse.json({ error: "notice_id not found in pending_audits" }, { status: 404 });

  // Step 2: flip pending_audits.in_pipeline = true.
  const { error: pinPaErr } = await supabase
    .from("pending_audits")
    .update({ in_pipeline: true })
    .eq("notice_id", notice_id);
  if (pinPaErr) return NextResponse.json({ error: `pending_audits pin failed: ${pinPaErr.message}` }, { status: 503 });

  // Step 3: is there an audits row already? If so, just ensure in_pipeline=true on it.
  const { data: existing, error: existErr } = await supabase
    .from("audits")
    .select("id, in_pipeline")
    .eq("notice_id", notice_id)
    .maybeSingle();
  if (existErr) return NextResponse.json({ error: `audits lookup failed: ${existErr.message}` }, { status: 503 });

  if (existing) {
    if (existing.in_pipeline === true) {
      return NextResponse.json({ ok: true, audit_id: existing.id, created: false });
    }
    const { error: upErr } = await supabase
      .from("audits")
      .update({ in_pipeline: true })
      .eq("id", existing.id);
    if (upErr) return NextResponse.json({ error: `audits in_pipeline update failed: ${upErr.message}` }, { status: 503 });
    return NextResponse.json({ ok: true, audit_id: existing.id, created: false });
  }

  // Step 4: insert a stub audit row. Required columns with defaults (audit_source,
  // bid_submitted, in_pipeline, ko_contacted, ko_email_sent, model_used) are
  // either being set explicitly here or covered by their defaults.
  const { data: inserted, error: insErr } = await supabase
    .from("audits")
    .insert({
      notice_id:           pa.notice_id,
      solicitation_number: pa.solicitation_number,
      title:               pa.title,
      agency:              pa.agency,
      naics_code:          pa.naics_code,
      set_aside:           pa.set_aside,
      response_deadline:   pa.response_deadline,
      user_id:             user.id,
      status:              "pending",
      in_pipeline:         true,
      audit_source:        "opportunities_pin"
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json({ error: `audits stub insert failed: ${insErr?.message || "no id returned"}` }, { status: 503 });
  }

  return NextResponse.json({ ok: true, audit_id: inserted.id, created: true });
}
