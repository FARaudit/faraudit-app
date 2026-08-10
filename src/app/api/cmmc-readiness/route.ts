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
    // response_deadline is SAM's own closing date. Without it the page states a compliance
    // obligation and says nothing about whether the work can still be bid — and the only date
    // on the row was the date WE ran the audit, which reads as the solicitation's own. A
    // requirement on a closed solicitation is history, not a task.
    .select("id, notice_id, solicitation_number, title, agency, created_at, response_deadline, compliance_json")
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
    title: string | null; agency: string | null; created_at: string | null;
    response_deadline: string | null; matched_on: string | null;
  }>> = { "1": [], "2": [], "3": [] };
  // An audit with no compliance_json was never analyzed, so it cannot answer
  // the question either way — counted separately rather than as "not required".
  let unanalyzed = 0;

  // ONE ROW PER SOLICITATION, THE MOST RECENT AUDIT OF IT. Re-auditing a solicitation is
  // normal — an amendment lands, the customer re-runs it — and every run was its own row
  // here, so the same requirement appeared three and four times and each repeat counted
  // again toward "solicitations that require CMMC". The page then stated a number of
  // SOLICITATIONS that was really a number of AUDIT RUNS.
  //
  // The key is the solicitation number, then the notice id, and finally the audit's own id.
  // Falling back to the id matters: without it every row that carries neither identifier
  // would share one key and collapse into a single arbitrary survivor, which would hide
  // real solicitations rather than duplicates.
  //
  // The query is already ordered created_at DESC, so the first row seen for a key is the
  // most recent audit of it — but the order is asserted here rather than assumed, because a
  // later edit to the query would otherwise silently start keeping the oldest.
  const rawRows = (audits || []) as Array<Record<string, unknown>>;
  const newestFirst = [...rawRows].sort((x, y) =>
    Date.parse(String(y.created_at ?? 0)) - Date.parse(String(x.created_at ?? 0)));
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const a of newestFirst) {
    const key = String(a.solicitation_number ?? "").trim()
      || String(a.notice_id ?? "").trim()
      || `id:${String(a.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(a);
  }
  const collapsed = rawRows.length - rows.length;

  for (const a of rows) {
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
        response_deadline: (a.response_deadline as string) || null,
        matched_on: trigger
      });
    }
  }

  const flagged = distribution["1"] + distribution["2"] + distribution["3"];
  return NextResponse.json({
    reference: LEVELS,
    distribution,
    by_level: byLevel,
    // BOTH NUMBERS, because they answer different questions and the page states one of them.
    // total_solicitations is what the distribution sums to; total_audited is how many runs
    // produced it. Returning only the second and labelling it "solicitations" is the defect
    // this dedupe exists to fix, and returning only the first would hide the re-runs.
    total_solicitations: rows.length,
    total_audited: rawRows.length,
    duplicates_collapsed: collapsed,
    unanalyzed,
    meta: {
      source: "audits.compliance_json",
      deduped_by: "solicitation_number|notice_id|id, most recent kept",
      reason: rows.length === 0 ? "no-audits" : flagged === 0 ? "none-flagged" : null
    }
  });
}
