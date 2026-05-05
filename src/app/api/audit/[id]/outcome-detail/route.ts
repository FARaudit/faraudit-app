import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED_OUTCOMES = new Set([
  "tracking",
  "bidding",
  "submitted",
  "awarded",
  "lost",
  "withdrawn"
]);
const ALLOWED_RELATIONSHIPS = new Set(["cold", "warm", "strong", "strategic"]);
const ALLOWED_LOST_CATEGORIES = new Set([
  "price",
  "technical",
  "past_performance",
  "timing",
  "relationships",
  "other"
]);

interface Body {
  outcome?: string | null;
  outcome_recorded_at?: string | null;
  margin_estimated_pct?: number | null;
  margin_actual_pct?: number | null;
  contract_value_actual?: number | null;
  cpars_rating?: number | null;
  customer_relationship_strength?: string | null;
  win_reason?: string | null;
  lost_to_competitor?: string | null;
  lost_reason_category?: string | null;
  lessons_learned?: string | null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("audit_outcomes")
    .select("*")
    .eq("audit_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data ?? null });
}

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

  if (body.outcome !== undefined && body.outcome !== null && !ALLOWED_OUTCOMES.has(body.outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of ${[...ALLOWED_OUTCOMES].join(", ")}` },
      { status: 400 }
    );
  }
  if (
    body.customer_relationship_strength !== undefined &&
    body.customer_relationship_strength !== null &&
    !ALLOWED_RELATIONSHIPS.has(body.customer_relationship_strength)
  ) {
    return NextResponse.json(
      { error: `customer_relationship_strength must be one of ${[...ALLOWED_RELATIONSHIPS].join(", ")}` },
      { status: 400 }
    );
  }
  if (
    body.lost_reason_category !== undefined &&
    body.lost_reason_category !== null &&
    !ALLOWED_LOST_CATEGORIES.has(body.lost_reason_category)
  ) {
    return NextResponse.json(
      { error: `lost_reason_category must be one of ${[...ALLOWED_LOST_CATEGORIES].join(", ")}` },
      { status: 400 }
    );
  }
  if (
    body.cpars_rating !== undefined &&
    body.cpars_rating !== null &&
    (body.cpars_rating < 1 || body.cpars_rating > 5 || !Number.isInteger(body.cpars_rating))
  ) {
    return NextResponse.json({ error: "cpars_rating must be an integer 1-5" }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    audit_id: id,
    user_id: user.id
  };
  if (body.outcome !== undefined) row.outcome = body.outcome ?? "tracking";
  if (body.outcome_recorded_at !== undefined) row.outcome_recorded_at = body.outcome_recorded_at;
  if (body.margin_estimated_pct !== undefined) row.margin_estimated_pct = body.margin_estimated_pct;
  if (body.margin_actual_pct !== undefined) row.margin_actual_pct = body.margin_actual_pct;
  if (body.contract_value_actual !== undefined) row.contract_value_actual = body.contract_value_actual;
  if (body.cpars_rating !== undefined) row.cpars_rating = body.cpars_rating;
  if (body.customer_relationship_strength !== undefined) row.customer_relationship_strength = body.customer_relationship_strength;
  if (body.win_reason !== undefined) row.win_reason = body.win_reason;
  if (body.lost_to_competitor !== undefined) row.lost_to_competitor = body.lost_to_competitor;
  if (body.lost_reason_category !== undefined) row.lost_reason_category = body.lost_reason_category;
  if (body.lessons_learned !== undefined) row.lessons_learned = body.lessons_learned;

  if (row.outcome === undefined) {
    row.outcome = "tracking";
  }

  const { data, error } = await supabase
    .from("audit_outcomes")
    .upsert(row, { onConflict: "audit_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, row: data, savedAt: new Date().toISOString() });
}
