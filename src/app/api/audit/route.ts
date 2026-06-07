import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency, type Solicitation } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { runAudit, runAuditV2, runAuditV2Metadata, AUDIT_V2_ENABLED, type PdfSource } from "@/lib/audit-engine";
import { uploadPdfToFilesApi } from "@/lib/anthropic-files";
import {
  noticeIdSchema,
  pdfFileSchema,
  sanitizeFilename,
  MAX_PDF_BYTES
} from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";

// FA-2 (2026-05-17): mirror agents/audit-ai/pdf.ts + src/lib/sam-pdf.ts —
// PDFs above this size are uploaded to the Anthropic Files API once instead
// of being inlined as base64 on every model call. Keep the constant value in
// sync with the canonical pdf.ts twin (it's not exported from there because
// the constant is implementation-private to each loader).
const PDF_FILES_API_THRESHOLD_BYTES = 20_000_000;

// Force Node.js runtime explicitly · Edge caps maxDuration well below
// the 300s the 3-call audit pipeline can need on a 20+ page IDIQ, and
// lacks the Buffer / pdf-parse APIs the audit engine relies on.
// force-dynamic ensures every audit POST gets a fresh invocation.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  // safeName is hoisted above the Files API upload path so the filename is
  // available both for that upload (passes a real name to Anthropic) and for
  // the synthesized solicitation block below.
  let safeName: string | null = null;
  if (pdf) {
    pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    if (!isPdfMagicValid(pdfBuffer)) {
      return NextResponse.json(
        { error: "File is not a valid PDF (magic bytes mismatch)" },
        { status: 400 }
      );
    }
    safeName = sanitizeFilename(pdf.name);
  }

  // ━━ Build solicitation source ━━
  let solicitation: Solicitation | null = null;
  if (noticeId) {
    if (!process.env.SAM_API_KEY) {
      return NextResponse.json(
        { error: "SAM API key not configured. Contact support." },
        { status: 503 }
      );
    }
    solicitation = await fetchSolicitationByNoticeId(noticeId);
    if (!solicitation && !pdf) {
      return NextResponse.json(
        { error: "Solicitation not found on SAM.gov. Try uploading the PDF directly, or verify the ID at sam.gov." },
        { status: 404 }
      );
    }
  }

  if (!solicitation && pdf && safeName) {
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
      fullParentPathName: null,
      naicsCode: null,
      type: null,
      typeOfSetAside: null,
      postedDate: null,
      responseDeadLine: null,
      description: `(PDF upload: ${safeName}, ${(pdf.size / 1024).toFixed(0)} KB — Claude reads attached document directly.)`,
      resourceLinks: []
    };
  }

  if (!solicitation) {
    return NextResponse.json({ error: "No solicitation source available" }, { status: 400 });
  }

  // ━━ Content for Claude — pdf / image / text via fetchPdfFromSamUrl ━━
  // Outcomes, in priority order:
  //   1. User upload (pdfBuffer set above):
  //        a. ≤20MB → inline base64, pdfSource="uploaded"
  //        b. >20MB → uploaded to Anthropic Files API, pdfSource="uploaded_pdf_via_files_api"  (FA-2)
  //   2. Notice ID + no upload + SAM resourceLinks → fetchPdfFromSamUrl returns
  //      one of three arms:
  //        a. PDF arm (inline)              → pdfBase64 set, pdfSource="sam_fetched"
  //        b. PDF arm (Files API, >20MB)    → pdfFileId set, pdfSource="sam_pdf_via_files_api"  (FA-2)
  //        c. Image arm (JPEG/PNG)          → imageBase64+imageMediaType set,
  //                                           pdfSource="sam_image_extracted"               (FA-1)
  //        d. Text arm (DOCX/XLSX/DOC/TXT)  → extractedText+extractedFormat set,
  //                                           pdfSource="sam_text_extracted"
  //   3. Notice ID + no upload + (no resourceLinks OR fetch fails OR oversize)
  //      → pdfSource="sam_unavailable" with reason captured for diagnostics.
  //      Audit still runs metadata-only.
  let pdfBase64: string | null = null;
  let pdfFileId: string | null = null;
  let imageBase64: string | null = null;
  let imageMediaType: "image/jpeg" | "image/png" | null = null;
  let extractedText: string | null = null;
  let extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null = null;
  let pdfSource: PdfSource = "sam_unavailable";
  let pdfUnavailableReason: string | null = null;

  if (pdfBuffer) {
    if (pdfBuffer.length > PDF_FILES_API_THRESHOLD_BYTES) {
      const uploaded = await uploadPdfToFilesApi(pdfBuffer, safeName);
      pdfFileId = uploaded.fileId;
      pdfSource = "uploaded_pdf_via_files_api";
    } else {
      pdfBase64 = pdfBuffer.toString("base64");
      pdfSource = "uploaded";
    }
  }

  if (!pdfBase64 && !pdfFileId && noticeId && solicitation.resourceLinks.length > 0) {
    try {
      const fetched = await fetchPdfFromSamUrl(solicitation.resourceLinks[0]);
      if (fetched.bytes > MAX_PDF_BYTES) {
        pdfUnavailableReason = `oversize (${(fetched.bytes / 1024 / 1024).toFixed(1)}MB > ${MAX_PDF_BYTES / 1024 / 1024}MB)`;
      } else if (fetched.kind === "pdf") {
        if (fetched.fileId) {
          pdfFileId = fetched.fileId;
          pdfSource = "sam_pdf_via_files_api";
        } else {
          pdfBase64 = fetched.base64;
          pdfSource = "sam_fetched";
        }
      } else if (fetched.kind === "image") {
        imageBase64 = fetched.base64;
        imageMediaType = fetched.mediaType;
        pdfSource = fetched.resized ? "sam_image_resized" : "sam_image_extracted";
      } else {  // fetched.kind === "text"
        extractedText = fetched.extractedText;
        extractedFormat = fetched.format;
        pdfSource = "sam_text_extracted";
      }
    } catch (err) {
      pdfUnavailableReason = err instanceof Error ? err.message.slice(0, 200) : "unknown fetch error";
    }
  } else if (!pdfBase64 && !pdfFileId && noticeId) {
    pdfUnavailableReason =
      solicitation.resourceLinks.length === 0
        ? "no resourceLinks on SAM opportunity"
        : "missing PDF source";
  }

  // ━━ Insert pending audit row ━━
  // resolveAgency() prefers fullParentPathName (the only field SAM v2 reliably
  // populates as of 2026-05-07) and falls back to department/subTier for
  // legacy responses. Without this, all post-2026-05 audits land with
  // agency=NULL — the visible "agency=null" symptom across the existing 8
  // rows that prompted P0-G.
  //
  // sam-ingest fallback (2026-06-03): when the live SAM call returns a
  // solicitation with no agency fields populated, fall back to whatever
  // agency the sam-ingest cron already persisted on the matching
  // pending_audits row. Same notice_id, two data sources, prefer non-null.
  // Skipped for PDF-only uploads (no real notice_id to match on).
  let agency: string | null = resolveAgency(solicitation);
  if (!agency && solicitation.noticeId && !/^pdf-/i.test(solicitation.noticeId)) {
    const { data: pa } = await supabase
      .from("pending_audits")
      .select("agency")
      .eq("notice_id", solicitation.noticeId)
      .maybeSingle();
    if (pa?.agency) agency = pa.agency as string;
  }

  const { data: audit, error: insertError } = await supabase
    .from("audits")
    .insert({
      notice_id: solicitation.noticeId,
      solicitation_number: solicitation.solicitationNumber,
      title: solicitation.title,
      agency,
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
    const result = await runAudit({ solicitation, pdfBase64, pdfFileId, imageBase64, imageMediaType, extractedText, extractedFormat, pdfSource, pdfUnavailableReason });

    // audit-engine 13f4743 emits score_confidence + is_not_solicitation on
    // the result root. Fold them into compliance_json so the renderer can
    // read them directly instead of falling back to its own derivation.
    // Persisted alongside compliance_score per the engine's honesty flags.
    //
    // Also fold notice_type (from the SAM v2 Solicitation interface — e.g.
    // "Sources Sought", "Presolicitation", "Solicitation") so the view-
    // model's prelim-mode classifier can read it. No new column needed.
    const persistedComplianceJson = {
      ...result.compliance.json,
      score_confidence: result.score_confidence ?? null,
      is_not_solicitation: result.is_not_solicitation ?? false,
      notice_type: solicitation.type ?? null
    };

    const { error: updateError } = await supabase
      .from("audits")
      .update({
        overview_summary: result.overview.summary,
        overview_json: result.overview.json,
        compliance_summary: result.compliance.summary,
        compliance_json: persistedComplianceJson,
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

    // ━━ V2 shadow wire-up (AUDIT_ENGINE_V2=true, pdfBuffer-only inputs) ━━
    // Runs runAuditV2 after V1 success and persists structured V2 output
    // into compliance_json.v2_shadow. ZERO impact on V1 user response —
    // every error is swallowed; the client has already received V1's JSON
    // shape downstream. Visible in DB for inspection (Fix 7 verification).
    if (AUDIT_V2_ENABLED && pdfBuffer) {
      const v2Start = Date.now();
      try {
        const v2Result = await runAuditV2(pdfBuffer);
        const v2Shadow = {
          path: "pdf",
          judgment: v2Result.judgment,
          surfaces: {
            work_statement: v2Result.work_statement,
            work_statement_unknown: v2Result.work_statement_unknown,
            matrix_rollup: v2Result.matrix_rollup,
            submission_checklist_filtered: v2Result.submission_checklist_filtered,
            l02_catches: v2Result.l02_catches,
            confidence_notes: v2Result.confidence_notes,
            has_incumbent: v2Result.has_incumbent,
            metadata_brief: v2Result.metadata_brief ?? null,
          },
          extraction: {
            sections_detected: Object.keys(v2Result.sectionBag.sections),
            missing_sections: v2Result.sectionBag.missingSections,
            warnings: v2Result.warnings,
            extraction_warnings: v2Result.facts.extractionWarnings,
          },
          rendered_at: new Date().toISOString(),
          engine_ms: Date.now() - v2Start,
        };
        const { error: shadowError } = await supabase
          .from("audits")
          .update({ compliance_json: { ...persistedComplianceJson, v2_shadow: v2Shadow } })
          .eq("id", audit.id);
        if (shadowError) {
          console.error("[V2-SHADOW] db update failed (non-fatal):", shadowError.message);
        } else {
          console.log("[V2-SHADOW] stored for audit", audit.id, "engine_ms=", v2Shadow.engine_ms);
        }
      } catch (err) {
        console.error("[V2-SHADOW] runAuditV2 failed (non-fatal):", err instanceof Error ? err.message : err);
      }
    } else if (AUDIT_V2_ENABLED && pdfSource === "sam_unavailable" && solicitation.description && solicitation.description.length > 50) {
      // ━━ Fix 8 — V2 metadata-only shadow path ━━
      // Fires when SAM returned a notice but no PDF was retrievable. Pure
      // deterministic synthesis: eligibility + deadline math + synopsis +
      // CO contact + missing-intel list. Zero LLM cost. Same v2_shadow
      // envelope as the PDF path so downstream consumers see one shape.
      const v2Start = Date.now();
      try {
        const v2Result = await runAuditV2Metadata({
          noticeId: solicitation.noticeId,
          title: solicitation.title,
          description: solicitation.description,
          naicsCode: solicitation.naicsCode,
          typeOfSetAside: solicitation.typeOfSetAside,
          postedDate: solicitation.postedDate,
          responseDeadLine: solicitation.responseDeadLine,
          noticeType: solicitation.type,
          agency,
        });
        const v2Shadow = {
          path: "metadata_only",
          judgment: v2Result.judgment,
          surfaces: {
            work_statement: null,
            work_statement_unknown: null,
            matrix_rollup: v2Result.matrix_rollup,
            submission_checklist_filtered: v2Result.submission_checklist_filtered,
            l02_catches: v2Result.l02_catches,
            confidence_notes: v2Result.confidence_notes,
            has_incumbent: false,
            metadata_brief: v2Result.metadata_brief ?? null,
          },
          extraction: {
            sections_detected: [] as string[],
            missing_sections: [] as string[],
            warnings: v2Result.warnings,
            extraction_warnings: v2Result.facts.extractionWarnings,
          },
          rendered_at: new Date().toISOString(),
          engine_ms: Date.now() - v2Start,
        };
        const { error: shadowError } = await supabase
          .from("audits")
          .update({ compliance_json: { ...persistedComplianceJson, v2_shadow: v2Shadow } })
          .eq("id", audit.id);
        if (shadowError) {
          console.error("[V2-SHADOW-META] db update failed (non-fatal):", shadowError.message);
        } else {
          console.log("[V2-SHADOW-META] stored for audit", audit.id, "engine_ms=", v2Shadow.engine_ms);
        }
      } catch (err) {
        console.error("[V2-SHADOW-META] runAuditV2Metadata failed (non-fatal):", err instanceof Error ? err.message : err);
      }
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
        // Slug for the /audit/[id] route — clients should prefer this over
        // auditId in URL construction so paste-shares don't leak the UUID.
        solicitationNumber: solicitation.solicitationNumber,
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
    console.error("[audit POST] failed", { auditId: audit.id, message });
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
