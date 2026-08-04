import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { LEVELS, inferLevel } from "@/lib/bd-os/cmmc-levels";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const auditId = url.searchParams.get("audit_id");

  // If audit_id passed, return per-audit assessment.
  if (auditId) {
    const { data: audit, error } = await supabase
      .from("audits")
      .select("id, notice_id, title, agency, compliance_json")
      .eq("id", auditId)
      .single();
    if (error || !audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });
    const { level, trigger } = inferLevel(audit as Record<string, unknown>);
    const levelData = level === "0" ? null : LEVELS[level];
    return NextResponse.json({
      audit_id: auditId,
      required_level: level === "0" ? "NOT REQUIRED" : `CMMC ${level}`,
      matched_on: trigger,
      level_data: levelData,
      reference: LEVELS
    });
  }

  // Aggregate: what CMMC the customer's own audited solicitations demand.
  // This is a REQUIREMENT view, never a posture view — the product holds no
  // self-assessment, so it can say what a solicitation asks for and nothing
  // about whether this company meets it.
  const { data: audits, error: listError } = await supabase
    .from("audits")
    .select("id, notice_id, solicitation_number, title, agency, created_at, compliance_json")
    .order("created_at", { ascending: false })
    .limit(500);

  if (listError) {
    return NextResponse.json(
      { error: `audits unavailable: ${listError.message}`, meta: { reason: "audits-unavailable" } },
      { status: 503 }
    );
  }

  const distribution: Record<"0" | "1" | "2" | "3", number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  const byLevel: Record<"1" | "2" | "3", Array<{
    id: string; notice_id: string | null; solicitation_number: string | null;
    title: string | null; agency: string | null; created_at: string | null; matched_on: string | null;
  }>> = { "1": [], "2": [], "3": [] };
  // An audit with no compliance_json was never analyzed, so it cannot answer
  // the question either way — counted separately rather than as "not required".
  let unanalyzed = 0;

  for (const a of (audits || []) as Array<Record<string, unknown>>) {
    if (!a.compliance_json) unanalyzed++;
    const { level, trigger } = inferLevel(a);
    distribution[level] += 1;
    if (level !== "0") {
      byLevel[level].push({
        id: String(a.id),
        notice_id: (a.notice_id as string) || null,
        solicitation_number: (a.solicitation_number as string) || null,
        title: (a.title as string) || null,
        agency: (a.agency as string) || null,
        created_at: (a.created_at as string) || null,
        matched_on: trigger
      });
    }
  }

  const flagged = distribution["1"] + distribution["2"] + distribution["3"];
  return NextResponse.json({
    reference: LEVELS,
    distribution,
    by_level: byLevel,
    total_audited: (audits || []).length,
    unanalyzed,
    meta: {
      source: "audits.compliance_json",
      reason: (audits || []).length === 0 ? "no-audits" : flagged === 0 ? "none-flagged" : null
    }
  });
}
