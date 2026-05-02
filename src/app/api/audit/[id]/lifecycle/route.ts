import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface Body {
  outcome?: string | null;
  outcome_date?: string | null;
  ko_contacted?: boolean;
  ko_contact_date?: string | null;
  bid_submitted?: boolean;
  bid_submit_date?: string | null;
  team_assignee?: string | null;
}

const ALLOWED_OUTCOMES = new Set(["won", "lost", "pending", "no-bid"]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.outcome !== undefined) {
    if (body.outcome !== null && !ALLOWED_OUTCOMES.has(body.outcome)) {
      return NextResponse.json({ error: `outcome must be one of ${[...ALLOWED_OUTCOMES].join(", ")}` }, { status: 400 });
    }
    update.outcome = body.outcome;
  }
  if (body.outcome_date !== undefined)    update.outcome_date    = body.outcome_date;
  if (body.ko_contacted !== undefined)    update.ko_contacted    = !!body.ko_contacted;
  if (body.ko_contact_date !== undefined) update.ko_contact_date = body.ko_contact_date;
  if (body.bid_submitted !== undefined)   update.bid_submitted   = !!body.bid_submitted;
  if (body.bid_submit_date !== undefined) update.bid_submit_date = body.bid_submit_date;
  if (body.team_assignee !== undefined)   update.team_assignee   = body.team_assignee;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await supabase.from("audits").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `lifecycle save failed: ${error.message} — run migration 002_audits_lockin.sql` },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
