import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { findIncumbentByNaicsAgency } from "@/lib/usaspending";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ notice_id: string }> }
) {
  const { notice_id } = await ctx.params;
  if (!notice_id) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Try audits table first, then pending_audits.
  let row: Record<string, unknown> | null = null;
  let table: "audits" | "pending_audits" = "audits";
  {
    const { data } = await supabase
      .from("audits")
      .select("id, notice_id, naics_code, agency, incumbent_name, incumbent_award_value, incumbent_expiry, incumbent_uei, incumbent_lookup_at")
      .eq("notice_id", notice_id)
      .maybeSingle();
    if (data) row = data as Record<string, unknown>;
  }
  if (!row) {
    const { data } = await supabase
      .from("pending_audits")
      .select("id, notice_id, naics_code, agency, incumbent_name, incumbent_award_value, incumbent_expiry, incumbent_uei, incumbent_lookup_at")
      .eq("notice_id", notice_id)
      .maybeSingle();
    if (data) {
      row = data as Record<string, unknown>;
      table = "pending_audits";
    }
  }
  if (!row) return NextResponse.json({ error: "notice not found" }, { status: 404 });

  // Cache hit: return existing incumbent if looked up within 30 days.
  const lookupAt = row.incumbent_lookup_at as string | null;
  if (row.incumbent_name && lookupAt) {
    const ageDays = (Date.now() - new Date(lookupAt).getTime()) / 86400_000;
    if (ageDays < 30) {
      return NextResponse.json({
        cached: true,
        incumbent: {
          name: row.incumbent_name,
          award_value: row.incumbent_award_value,
          expiry: row.incumbent_expiry,
          uei: row.incumbent_uei,
          looked_up_at: lookupAt
        }
      });
    }
  }

  const naics = row.naics_code as string | null;
  const agency = row.agency as string | null;
  if (!naics) {
    return NextResponse.json({
      cached: false,
      incumbent: null,
      reason: "No NAICS on solicitation — cannot look up incumbent."
    });
  }

  const found = await findIncumbentByNaicsAgency({ naicsCode: naics, agencyKeyword: agency });
  const lookedUpAt = new Date().toISOString();

  if (!found || !found.recipient_name) {
    // Persist the negative lookup so we don't hammer USAspending repeatedly.
    await supabase
      .from(table)
      .update({ incumbent_lookup_at: lookedUpAt })
      .eq("id", row.id as string);
    return NextResponse.json({
      cached: false,
      incumbent: null,
      reason: "No matching prime contract found in the past 365 days."
    });
  }

  const update = {
    incumbent_name: found.recipient_name,
    incumbent_uei: found.recipient_uei,
    incumbent_award_value: found.award_amount ? Math.round(found.award_amount) : null,
    incumbent_expiry: found.period_of_performance_end ? found.period_of_performance_end.slice(0, 10) : null,
    incumbent_lookup_at: lookedUpAt
  };

  await supabase.from(table).update(update).eq("id", row.id as string);

  return NextResponse.json({
    cached: false,
    incumbent: {
      name: update.incumbent_name,
      uei: update.incumbent_uei,
      award_value: update.incumbent_award_value,
      expiry: update.incumbent_expiry,
      looked_up_at: lookedUpAt,
      agency: found.agency,
      award_id: found.award_id,
      period_start: found.period_of_performance_start
    }
  });
}
