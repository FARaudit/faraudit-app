import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { LEVELS, inferLevel } from "@/lib/bd-os/cmmc-levels";
import { aggregateCmmc, isAnalyzed } from "@/lib/bd-os/cmmc-aggregate";

// The newest N runs, not all of them. The select carries whole compliance_json blobs (the live
// corpus averages ~44 KB a row) because that is what inferLevel reads, so an unbounded fetch is a
// memory and latency risk long before it is a correctness one. The cap is therefore kept — but it
// is REPORTED. A silent truncation would drop the customer's oldest solicitations off the page
// with the totals still presented as complete. Paging belongs behind a narrower projection, not
// on top of this select.
const ROW_CAP = 500;

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
      .select("id, notice_id, title, agency, status, compliance_json")
      .eq("id", auditId)
      .single();
    if (error || !audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });
    // A run that never finished cannot say a level is NOT REQUIRED — that is a finding, and this
    // audit has none. It reports as unanswered instead.
    if (!isAnalyzed(audit as Record<string, unknown>)) {
      return NextResponse.json({
        audit_id: auditId,
        required_level: "NOT ANALYZED",
        analyzed: false,
        audit_status: (audit as { status?: string | null }).status ?? null,
        matched_on: null,
        level_data: null,
        reference: LEVELS
      });
    }
    const { level, trigger } = inferLevel(audit as Record<string, unknown>);
    const levelData = level === "0" ? null : LEVELS[level];
    return NextResponse.json({
      audit_id: auditId,
      required_level: level === "0" ? "NOT REQUIRED" : `CMMC ${level}`,
      analyzed: true,
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
    //
    // status is read so a run that never produced an answer cannot be counted as one. See
    // isAnalyzed() in cmmc-aggregate.ts.
    .select("id, notice_id, solicitation_number, title, agency, status, created_at, response_deadline, compliance_json")
    .order("created_at", { ascending: false })
    // One past the cap, so hitting it is DETECTABLE rather than indistinguishable from a
    // customer who happens to have exactly ROW_CAP audits.
    .limit(ROW_CAP + 1);

  if (listError) {
    return NextResponse.json(
      { error: `audits unavailable: ${listError.message}`, meta: { reason: "audits-unavailable" } },
      { status: 503 }
    );
  }

  const fetched = (audits || []) as Array<Record<string, unknown>>;
  const truncated = fetched.length > ROW_CAP;
  const agg = aggregateCmmc(truncated ? fetched.slice(0, ROW_CAP) : fetched);

  return NextResponse.json({
    reference: LEVELS,
    distribution: agg.distribution,
    by_level: agg.byLevel,
    // THREE NUMBERS, because they answer three different questions and the page states more than
    // one of them. total_solicitations is every solicitation the customer has run;
    // analyzed_solicitations is what the distribution sums to; total_audited is how many runs
    // produced it. Returning only the last and labelling it "solicitations" was the defect the
    // dedupe fixed, and folding the first two together is the defect that let a failed run be
    // counted as a solicitation with no CMMC requirement.
    total_solicitations: agg.totalSolicitations,
    analyzed_solicitations: agg.analyzedSolicitations,
    total_audited: agg.totalAudited,
    duplicates_collapsed: agg.duplicatesCollapsed,
    unanalyzed: agg.unanalyzed,
    unanalyzed_failed: agg.unanalyzedFailed,
    unanalyzed_running: agg.unanalyzedRunning,
    meta: {
      source: "audits.compliance_json",
      deduped_by: "solicitation_number|notice_id|id, most recent COMPLETE run kept",
      // True means the page is showing the newest ROW_CAP runs and NOT the whole account. The
      // page has to say so: totals presented as complete when they are not is the same class of
      // claim as counting a failed run as a clear solicitation.
      truncated,
      row_cap: truncated ? ROW_CAP : null,
      reason: agg.reason
    }
  });
}
