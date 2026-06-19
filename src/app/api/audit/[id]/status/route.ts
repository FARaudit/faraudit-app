// FA-116 — GET /api/audit/[id]/status
// Poll target for async-enqueued audits. Reads under the caller's RLS
// session, so a user can only see status for audits they own. Returns the
// minimum the HomeClient poller needs: status to branch on, error_message
// for the failed state, solicitationNumber for the redirect slug.
//
// RC6 FIX A (2026-06-18) — also serves the report page's progressive-render
// poller. The /audit/[id] report previously used a full-page
// <meta http-equiv="refresh"> during the V2 "finalizing" window (up to ~13
// min of hard reloads → flicker + lost scroll/state). That meta tag is gone;
// the page now JS-polls THIS endpoint and reloads exactly once when V2 lands
// (has_v2_shadow) or terminally errors (v2_error). So this route additionally
// returns the finalizing-window fields derived from compliance_json. The
// existing FA-116 fields are unchanged (additive — HomeClient is unaffected).
// Accepts a UUID or a solicitation_number slug, mirroring /audit/[id].

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // UUID path: direct lookup. Slug path: case-insensitive solicitation_number
  // match, most-recent first — same resolution the /audit/[id] page uses, so a
  // slug-URL'd report can poll without first resolving the UUID. Lightweight:
  // only id + status fields + compliance_json (the finalizing flags live there).
  const cols =
    "id, status, current_stage, stage_updated_at, error_message, solicitation_number, compliance_json";
  let audit: Record<string, unknown> | null = null;
  if (UUID_RE.test(id)) {
    const { data, error } = await supabase.from("audits").select(cols).eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 503 });
    audit = data as Record<string, unknown> | null;
  } else {
    const { data, error } = await supabase
      .from("audits")
      .select(cols)
      .ilike("solicitation_number", id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 503 });
    audit = data && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
  }
  if (!audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  const comp = (audit.compliance_json ?? {}) as Record<string, unknown>;

  return NextResponse.json(
    {
      auditId: audit.id,
      status: audit.status ?? null,
      // RC7 PART A (2026-06-19) — surface the executor's staged progress so the
      // report page's finalizing poller can show FORWARD MOTION instead of a
      // frozen "Finalizing…" spinner. Prefer the dedicated column; fall back to
      // compliance_json.current_stage so a row written before the FA-160 column
      // migration still reports a stage. stage_updated_at lets the client detect
      // a genuinely-stalled run (no stage change for a long time) vs. live work.
      current_stage:
        (audit.current_stage as string | null) ??
        ((comp.current_stage as string | undefined) ?? null),
      stage_updated_at: audit.stage_updated_at ?? null,
      error_message: audit.error_message ?? null,
      solicitationNumber: audit.solicitation_number ?? null,
      // RC6 FIX A — progressive-render finalizing flags.
      analysis_phase: (comp.analysis_phase as string | undefined) ?? null,
      has_v2_shadow: !!comp.v2_shadow,
      v2_error: !!comp.v2_error
    },
    { headers: { "cache-control": "no-store" } }
  );
}
