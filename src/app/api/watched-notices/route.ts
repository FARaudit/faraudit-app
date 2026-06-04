// GET /api/watched-notices — current user's watch list (all statuses).
//
// Feeds the /watching page: KPI strip + filter pills + status grouping.
// Rows are returned grouped by status (audited | posted | watching) since
// the design renders three sections.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WatchedRow = {
  id: string;
  audit_id: string | null;
  notice_id: string;
  solicitation_number: string | null;
  title: string | null;
  agency: string | null;
  notice_type: string | null;
  response_deadline: string | null;
  status: "watching" | "posted" | "audited";
  posted_at: string | null;
  audited_at: string | null;
  created_at: string;
};

type Verdict = {
  score: number | null;
  scoreConfidence: string | null;
  recommendation: string | null;
};

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("watched_notices")
    .select("id, audit_id, notice_id, solicitation_number, title, agency, notice_type, response_deadline, status, posted_at, audited_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  const list = (rows ?? []) as WatchedRow[];

  // For audited rows, fetch the verdict tile data in one batch.
  const auditedIds = list
    .filter(r => r.status === "audited" && r.audit_id)
    .map(r => r.audit_id as string);

  const verdicts = new Map<string, Verdict>();
  if (auditedIds.length > 0) {
    const { data: auditRows } = await supabase
      .from("audits")
      .select("id, compliance_score, recommendation, compliance_json")
      .in("id", auditedIds);
    for (const a of auditRows ?? []) {
      const comp = (a.compliance_json as Record<string, unknown> | null) ?? {};
      verdicts.set(a.id as string, {
        score: (a.compliance_score as number | null) ?? null,
        scoreConfidence: (comp.score_confidence as string | null) ?? null,
        recommendation: (a.recommendation as string | null) ?? null
      });
    }
  }

  // KPI counts.
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let watchingCount = 0;
  let postedThisWeek = 0;
  let autoAudited = 0;
  let nextExpectedPost: string | null = null;

  const enriched = list.map(r => {
    if (r.status === "watching") {
      watchingCount++;
      if (r.response_deadline) {
        const t = new Date(r.response_deadline).getTime();
        if (!Number.isNaN(t) && t > nowMs) {
          if (!nextExpectedPost || t < new Date(nextExpectedPost).getTime()) {
            nextExpectedPost = r.response_deadline;
          }
        }
      }
    }
    if (r.status === "posted" && r.posted_at) {
      const t = new Date(r.posted_at).getTime();
      if (!Number.isNaN(t) && nowMs - t <= sevenDaysMs) postedThisWeek++;
    }
    if (r.status === "audited") autoAudited++;

    return {
      ...r,
      verdict: r.audit_id ? verdicts.get(r.audit_id) ?? null : null
    };
  });

  return NextResponse.json({
    kpi: {
      watching: watchingCount,
      postedThisWeek,
      autoAudited,
      nextExpectedPost
    },
    rows: enriched
  });
}
