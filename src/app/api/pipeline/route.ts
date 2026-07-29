import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { CAPTURE_STAGES, isPipelineStage } from "@/lib/pipeline-stages";

export const dynamic = "force-dynamic";

// GET    /api/pipeline                            — current user's pipeline rows.
// POST   /api/pipeline                            — add a notice as an early-stage
//        pursuit (the Opportunities "Pipeline" button). Idempotent per
//        (user, solicitation_number).
// DELETE /api/pipeline?solicitationNumber=X       — remove that reference's row,
//        but ONLY while it still sits in the capture stages ('01'/'02'/'03'):
//        a pursuit the user advanced into proposal work ('04'+) is never
//        silently destroyed by a toggle.
//
// Stage codes come from src/lib/pipeline-stages.ts (the canonical vocabulary).
// The repo migration originally named a different set; 20260729190000 aligns
// the DB constraint with those codes.

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("pipeline")
      .select("*")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pipeline: data ?? [] });
  } catch (err) {
    console.error("[api/pipeline]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

interface PostBody {
  solicitationNumber?: string;
  title?: string | null;
  agency?: string | null;
  naics?: string | null;
  dueDate?: string | null;         // ISO datetime or date
  estimatedValueM?: number | null; // real stated ceiling in $M — never invented
  stageCode?: string | null;       // capture stage — see src/lib/pipeline-stages.ts
}


export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: PostBody = {};
    try { body = (await req.json()) as PostBody; } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const ref = String(body.solicitationNumber ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!ref) return NextResponse.json({ error: "solicitationNumber required" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    // Idempotent: an existing row for this reference is returned, not duplicated.
    const { data: existing, error: exErr } = await supabase
      .from("pipeline")
      .select("id, stage")
      .eq("user_id", user.id)
      .eq("solicitation_number", ref)
      .limit(1);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, id: existing[0].id, stage: existing[0].stage, created: false });
    }

    const dueDate = body.dueDate ? String(body.dueDate).slice(0, 10) : null;
    // estimated_value is stored as a PLAIN NUMBER of dollars (as text — the
    // column is text). It must stay parseable: command-center-data sums it with
    // parseFloat(), and a display string like "$18.4M" parses to NaN → 0, so
    // every row added here would have counted as $0 in the weighted pipeline
    // total. Formatting happens at render (public/pipeline-live.js).
    const estValue =
      typeof body.estimatedValueM === "number" && Number.isFinite(body.estimatedValueM)
        ? String(Math.round(body.estimatedValueM * 1e6))
        : null;

    const stage = isPipelineStage(body.stageCode) && CAPTURE_STAGES.includes(body.stageCode) ? body.stageCode : "03";
    const { data, error } = await supabase
      .from("pipeline")
      .insert({
        user_id: user.id,
        stage,
        solicitation_number: ref,
        title,
        agency: body.agency ?? null,
        naics: body.naics ?? null,
        due_date: dueDate,
        estimated_value: estValue,
      })
      .select("id, stage")
      .single();
    if (error) {
      // 23505 = unique violation on (user_id, solicitation_number). The check
      // above races — two rapid clicks can both find nothing and both insert —
      // so the DATABASE is the arbiter of idempotency and a conflict here means
      // "already in the pipeline", not a failure. (The unique index is added by
      // 20260729190000_pipeline_stage_codes.sql; until it is applied this branch
      // simply never fires and the narrow race remains.)
      if (error.code === "23505") {
        const { data: existingRow } = await supabase
          .from("pipeline")
          .select("id, stage")
          .eq("user_id", user.id)
          .eq("solicitation_number", ref)
          .limit(1)
          .maybeSingle();
        return NextResponse.json({ ok: true, id: existingRow?.id ?? null, stage: existingRow?.stage ?? null, created: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // No `?? "tracking"` fallback: an insert that returned no row has no
    // persisted stage to report, and "tracking" is a value the constraint
    // rejects — reporting it would be a fabricated success (Rule 61).
    return NextResponse.json({ ok: true, id: data?.id ?? null, stage: data?.stage ?? null, created: true });
  } catch (err) {
    console.error("[api/pipeline POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ref = String(new URL(req.url).searchParams.get("solicitationNumber") ?? "").trim();
    if (!ref) return NextResponse.json({ error: "solicitationNumber required" }, { status: 400 });

    const { data, error } = await supabase
      .from("pipeline")
      .delete()
      .eq("user_id", user.id)
      .eq("solicitation_number", ref)
      .in("stage", CAPTURE_STAGES)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, removed: (data ?? []).length });
  } catch (err) {
    console.error("[api/pipeline DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
