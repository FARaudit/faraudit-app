// FA-89h — POST /api/opportunities/[notice_id]/unpin
// Reverses a Pipeline pin. Sets pending_audits.in_pipeline=false AND unpins
// only STUB audit rows (audit_source='opportunities_pin'). Real audits that
// the user manually pinned via Past Audits ("+ Pipeline" / FA-93b) are
// preserved — those use audit_source='audit_ai' or 'user' and stay pinned.
//
// Hardening (FA-89h.1): Postgres has no cross-table transactions exposed
// through PostgREST, so we use a sequential-guard + compensating-rollback
// saga: if the pending_audits PATCH fails, return immediately (nothing was
// written). If it succeeds but the audits UPDATE fails, attempt to rollback
// the pending_audits PATCH so the user sees a consistent "still pinned" state
// instead of a half-unpinned orphan stub. Response carries both flags so the
// client can detect partial-success cases (rollback also failed → real drift).

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

  // Step 1: PATCH pending_audits.in_pipeline=false. If this fails, nothing was
  // mutated yet — return immediately, no compensation needed.
  // FA-116: pin/unpin operates on cron-ingested rows only — never flip
  // in_pipeline on user-enqueued audit rows sharing the same notice_id.
  const { error: paErr } = await supabase
    .from("pending_audits")
    .update({ in_pipeline: false })
    .eq("notice_id", notice_id)
    .neq("source", "user");
  if (paErr) {
    console.error(`[unpin] pending_audits PATCH failed (${notice_id}): ${paErr.message}`);
    return NextResponse.json(
      { ok: false, pending_updated: false, audits_updated: false, error: `pending_audits unpin failed: ${paErr.message}` },
      { status: 503 }
    );
  }

  // Step 2: UPDATE audits stub. Only unpin rows where audit_source=opportunities_pin
  // so real audits manually pinned via Past Audits keep their state.
  const { error: auErr } = await supabase
    .from("audits")
    .update({ in_pipeline: false })
    .eq("notice_id", notice_id)
    .eq("audit_source", "opportunities_pin");
  if (auErr) {
    console.error(`[unpin] audits PATCH failed AFTER pending succeeded (${notice_id}): ${auErr.message} — attempting rollback`);
    // Compensating rollback: restore pending_audits.in_pipeline=true so the
    // user's Opportunities row + Pipeline card stay in lockstep. If THIS also
    // fails, we have real drift — report both errors so the operator can
    // reconcile manually.
    const { error: rbErr } = await supabase
      .from("pending_audits")
      .update({ in_pipeline: true })
      .eq("notice_id", notice_id)
      .neq("source", "user");
    if (rbErr) {
      console.error(`[unpin] ROLLBACK FAILED (${notice_id}): pending_audits stuck in_pipeline=false but audits stub stuck in_pipeline=true. Manual reconcile required. rollback_error=${rbErr.message}`);
      return NextResponse.json(
        {
          ok: false,
          pending_updated: true,
          audits_updated: false,
          rolled_back: false,
          error: `audits unpin failed (${auErr.message}); rollback of pending_audits also failed (${rbErr.message}) — manual reconcile required`
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        pending_updated: true,
        audits_updated: false,
        rolled_back: true,
        error: `audits unpin failed: ${auErr.message} — pending_audits rolled back to in_pipeline=true`
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, pending_updated: true, audits_updated: true });
}
