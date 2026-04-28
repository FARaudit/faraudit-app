import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, type Solicitation } from "@/lib/sam";
import { runAudit } from "@/lib/audit-engine";
import {
  noticeIdSchema,
  pdfFileSchema,
  sanitizeFilename,
  MAX_PDF_BYTES
} from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// PDF magic bytes — first four bytes of every PDF are %PDF (0x25 0x50 0x44 0x46).
const PDF_MAGIC = Buffer.from("%PDF", "ascii");

function isPdfMagicValid(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC);
}

export async function POST(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase env vars not set" }, { status: 500 });
  }

  // ━━ Auth ━━
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ━━ Rate limit (10 audits / hour / user) ━━
  const rate = checkRateLimit(`audit:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Try again in ${rate.retryAfter}s.`,
        retryAfter: rate.retryAfter
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfter),
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000))
        }
      }
    );
  }

  // ━━ Parse multipart body ━━
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  // ━━ Validate notice ID with zod ━━
  const noticeIdRaw = String(formData.get("noticeId") || "");
  const noticeIdResult = noticeIdSchema.safeParse(noticeIdRaw);
  if (!noticeIdResult.success) {
    return NextResponse.json(
      { error: noticeIdResult.error.issues[0]?.message || "Invalid notice ID" },
      { status: 400 }
    );
  }
  const noticeId = noticeIdResult.data;

  // ━━ Validate PDF (zod) ━━
  const pdfEntry = formData.get("pdf");
  let pdf: File | null = null;
  if (pdfEntry instanceof File && pdfEntry.size > 0) {
    const pdfResult = pdfFileSchema.safeParse(pdfEntry);
    if (!pdfResult.success) {
      return NextResponse.json(
        { error: pdfResult.error.issues[0]?.message || "Invalid PDF" },
        { status: 400 }
      );
    }
    pdf = pdfResult.data;
  }

  if (!noticeId && !pdf) {
    return NextResponse.json({ error: "noticeId or pdf required" }, { status: 400 });
  }

  // ━━ Hard byte cap (defense in depth — zod already checked) ━━
  if (pdf && pdf.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `PDF exceeds ${MAX_PDF_BYTES / 1024 / 1024}MB limit` },
      { status: 413 }
    );
  }

  // ━━ Magic-byte verification ━━
  // Defends against rename attacks (e.g. evil.exe.pdf with image/jpeg MIME).
  let pdfBuffer: Buffer | null = null;
  if (pdf) {
    pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    if (!isPdfMagicValid(pdfBuffer)) {
      return NextResponse.json(
        { error: "File is not a valid PDF (magic bytes mismatch)" },
        { status: 400 }
      );
    }
  }

  // ━━ Build solicitation source ━━
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

  if (!solicitation && pdf) {
    const safeName = sanitizeFilename(pdf.name);
    // PDF filenames downloaded from SAM.gov often look like "Solicitation+-+FA301626Q0068.pdf"
    // (URL-encoded). Decode + normalize so the audit row stores a readable title.
    const rawTitle = safeName.replace(/\.pdf$/i, "").replace(/\+/g, " ").trim();
    const cleanedTitle = rawTitle
      .replace(/^solicitation\s*[-–—]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    solicitation = {
      noticeId: noticeId || `pdf-${Date.now()}`,
      solicitationNumber: null,
      title: cleanedTitle || rawTitle || "Untitled solicitation",
      department: null,
      subTier: null,
      naicsCode: null,
      type: null,
      typeOfSetAside: null,
      postedDate: null,
      responseDeadLine: null,
      description: `(PDF upload: ${safeName}, ${(pdf.size / 1024).toFixed(0)} KB — Claude reads attached document directly.)`
    };
  }

  if (!solicitation) {
    return NextResponse.json({ error: "No solicitation source available" }, { status: 400 });
  }

  // ━━ PDF base64 for Claude document content block ━━
  const pdfBase64 = pdfBuffer ? pdfBuffer.toString("base64") : null;

  // ━━ Insert pending audit row ━━
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

  // ━━ Run three-call audit (engine sanitizes text + applies SECURITY_DIRECTIVE) ━━
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
        document_type: result.classification.document_type,
        document_type_rationale: result.classification.rationale,
        document_type_confidence: result.classification.confidence,
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

    // Best-effort intelligence-corpus write — every audit teaches the engine
    // what trap clauses fire on what document types. Failure here doesn't
    // disrupt the audit response.
    try {
      const flags = (result.compliance.json.dfars_flags ?? []).filter((f) => f.detected);
      if (flags.length > 0) {
        await supabase.from("fa_intelligence_corpus").insert(
          flags.map((f) => ({
            audit_id: audit.id,
            solicitation_id: solicitation.noticeId,
            trap_type: f.clause,
            was_caught: true,
            outcome: result.recommendation,
            metadata: { document_type: result.classification.document_type, severity: f.severity }
          }))
        );
      }
    } catch {
      /* silent — corpus is best-effort */
    }

    return NextResponse.json(
      {
        auditId: audit.id,
        status: "complete",
        recommendation: result.recommendation,
        score: result.compliance_score
      },
      {
        headers: {
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000))
        }
      }
    );
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
