import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, type Solicitation } from "@/lib/sam";
import { runAudit } from "@/lib/audit-engine";

export const maxDuration = 60;

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase env vars not set" }, { status: 500 });
  }

  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const noticeId = String(formData.get("noticeId") || "").trim();
  const pdfEntry = formData.get("pdf");
  const pdf = pdfEntry instanceof File && pdfEntry.size > 0 ? pdfEntry : null;

  if (!noticeId && !pdf) {
    return NextResponse.json({ error: "noticeId or pdf required" }, { status: 400 });
  }

  if (pdf && pdf.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: `PDF exceeds ${MAX_PDF_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
  }

  // 1. Pull solicitation from SAM.gov when notice ID given. PDF-only audits use a stub.
  let solicitation: Solicitation | null = null;
  if (noticeId) {
    solicitation = await fetchSolicitationByNoticeId(noticeId);
    if (!solicitation && !pdf) {
      return NextResponse.json(
        { error: "Solicitation not found in SAM.gov (or SAM_API_KEY not set)" },
        { status: 404 }
      );
    }
  }

  // PDF-only fallback — build a minimal solicitation record
  if (!solicitation && pdf) {
    solicitation = {
      noticeId: noticeId || `pdf-${Date.now()}`,
      solicitationNumber: null,
      title: pdf.name.replace(/\.pdf$/i, ""),
      department: null,
      subTier: null,
      naicsCode: null,
      type: null,
      typeOfSetAside: null,
      postedDate: null,
      responseDeadLine: null,
      description: `(PDF upload: ${pdf.name}, ${(pdf.size / 1024).toFixed(0)} KB — Claude reads attached document directly.)`
    };
  }

  if (!solicitation) {
    return NextResponse.json({ error: "No solicitation source available" }, { status: 400 });
  }

  // 2. Read PDF bytes (if any) into base64 for Claude
  let pdfBase64: string | null = null;
  if (pdf) {
    const buffer = Buffer.from(await pdf.arrayBuffer());
    pdfBase64 = buffer.toString("base64");
  }

  // 3. Insert pending audit row
  const { data: audit, error: insertError } = await supabase
    .from("audits")
    .insert({
      notice_id: solicitation.noticeId,
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

  // 4. Run three-call audit (with PDF if attached)
  try {
    const result = await runAudit({ solicitation, pdfBase64 });

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

    return NextResponse.json({
      auditId: audit.id,
      recommendation: result.recommendation,
      score: result.compliance_score
    });
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
