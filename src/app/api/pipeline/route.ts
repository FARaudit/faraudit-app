import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

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
// Stage codes: the LIVE pipeline table's check constraint accepts the
// '01'..'08' codes that pipeline-live.js + command-center-data already use
// (probed 2026-07-29: 'tracking' from the repo migration is REJECTED by the
// deployed constraint — the live schema is the truth here).

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
  stageCode?: string | null;       // '01' pre-sol · '02' sources sought · '03' solicitation
}

// The stages a notice may ENTER the pipeline at, from the Opportunities feed.
const CAPTURE_STAGES = ["01", "02", "03"];
// Every stage a pursuit can occupy once it is here. Removal and stage moves scope to
// this, not to CAPTURE_STAGES: a pursuit advanced to 04 or beyond is still the
// customer's row, and scoping DELETE to the entry stages left it silently unmatched —
// a 200 reporting `removed: 0` about a row sitting in plain sight.
const ALL_STAGES = ["01", "02", "03", "04", "05", "06", "07", "08"];

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

    const stage = CAPTURE_STAGES.includes(String(body.stageCode)) ? String(body.stageCode) : "03";
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // No `?? "tracking"` fallback: an insert that returned no row has no
    // persisted stage to report, and "tracking" is a value the constraint
    // rejects — reporting it would be a fabricated success (Rule 61).
    return NextResponse.json({ ok: true, id: data?.id ?? null, stage: data?.stage ?? null, created: true });
  } catch (err) {
    console.error("[api/pipeline POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* PATCH /api/pipeline?solicitationNumber=X  { stageCode }
   A pursuit had no way to move. Capture is a sequence — synopsis to award — and the
   page rendered eight stages while the API could only place a row at entry and delete
   it. So a deadline passed and the pursuit stayed at "03 Solicitation" forever, and the
   "P0 · action now" count it fed was permanent with no in-product action that could
   clear it. The only honest options were to remove the pursuit or to leave it wrong.

   Returns `moved`, the count of rows actually updated, because a zero-row PostgREST
   write answers 200 and a caller reading only the status reports a move that did not
   happen. */
export async function PATCH(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ref = String(new URL(req.url).searchParams.get("solicitationNumber") ?? "").trim();
    if (!ref) return NextResponse.json({ error: "solicitationNumber required" }, { status: 400 });

    let body: { stageCode?: string } = {};
    try { body = (await req.json()) as { stageCode?: string }; } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const stage = String(body.stageCode ?? "").trim();
    // An unrecognised stage is refused rather than clamped to a default: silently
    // filing a pursuit under a stage the caller did not ask for is a fabricated move.
    if (!ALL_STAGES.includes(stage)) {
      return NextResponse.json({ error: `stageCode must be one of ${ALL_STAGES.join(", ")}` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("pipeline")
      .update({ stage })
      .eq("user_id", user.id)
      .eq("solicitation_number", ref)
      .select("id, stage");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    return NextResponse.json({ ok: true, moved: rows.length, stage: rows[0]?.stage ?? null });
  } catch (err) {
    console.error("[api/pipeline PATCH]", err);
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
      .in("stage", ALL_STAGES)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, removed: (data ?? []).length });
  } catch (err) {
    console.error("[api/pipeline DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
