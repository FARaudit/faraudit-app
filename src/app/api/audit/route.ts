import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId } from "@/lib/sam";
import { runAudit } from "@/lib/audit-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Supabase env vars not set" },
      { status: 500 }
    );
  }

  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const noticeId = (body.noticeId || "").trim();

  if (!noticeId) {
    return NextResponse.json({ error: "noticeId required" }, { status: 400 });
  }

  // 1. Pull solicitation from SAM.gov
  const solicitation = await fetchSolicitationByNoticeId(noticeId);
  if (!solicitation) {
    return NextResponse.json(
      { error: "Solicitation not found in SAM.gov (or SAM_API_KEY not set)" },
      { status: 404 }
    );
  }

  // 2. Insert pending audit row
  const { data: audit, error: insertError } = await supabase
    .from("audits")
    .insert({
      notice_id: noticeId,
      solicitation_number: solicitation.solicitationNumber,
      title: solicitation.title,
      agency: solicitation.department,
      naics_code: solicitation.naicsCode,
      set_aside: solicitation.typeOfSetAside,
      posted_date: solicitation.postedDate,
      response_deadline: solicitation.responseDeadLine,
      user_id: user.id,
      status: "processing"
    })
    .select("id")
    .single();

  if (insertError || !audit) {
    return NextResponse.json(
      { error: insertError?.message || "Insert failed" },
      { status: 500 }
    );
  }

  // 3. Run three-call audit
  try {
    const result = await runAudit(solicitation);

    const { error: updateError } = await supabase
      .from("audits")
      .update({
        overview_summary: result.overview.summary,
        overview_json: result.overview.json,
        compliance_summary: result.compliance.summary,
        compliance_json: result.compliance.json,
        risks_summary: result.risks.summary,
        risks_json: result.risks.json,
        compliance_score: result.compliance_score,
        recommendation: result.recommendation,
        bid_recommendation: result.bid_recommendation,
        status: "complete",
        completed_at: new Date().toISOString()
      })
      .eq("id", audit.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, auditId: audit.id },
        { status: 500 }
      );
    }

    return NextResponse.json({ auditId: audit.id, recommendation: result.recommendation, score: result.compliance_score });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("audits")
      .update({ status: "failed", error_message: message })
      .eq("id", audit.id);
    return NextResponse.json({ error: message, auditId: audit.id }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "audit endpoint live" });
}
