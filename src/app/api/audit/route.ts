import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency, type Solicitation } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { assembleSamDocumentSet, type AssembledDocumentSet, type IngestionMeta } from "@/lib/sam-attachments";
import { type PdfSource } from "@/lib/audit-engine";
import { executeAudit, AuditPersistError } from "@/lib/audit-executor";
import { uploadPdfToFilesApi } from "@/lib/anthropic-files";
import { getAdminClient } from "@/lib/supabase-admin";
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

  // ━━ FA-116 — async enqueue branch (flag: AUDIT_ASYNC_ENQUEUE) ━━
  // Flag absent/false → sync path below, unchanged. Flag true → all
  // fast-fail validation above has passed; enqueue for the resident
  // audit-worker and return 202 immediately. SAM PDF download is deferred to
  // the worker (pdf_url); uploaded PDFs go to the Anthropic Files API NOW at
  // every size, because the worker never sees the multipart bytes.
  if (process.env.AUDIT_ASYNC_ENQUEUE === "true") {
    return enqueueAsyncAudit({ supabase, userId: user.id, solicitation, pdfBuffer, safeName, rate });
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
  // FA-136 — multi-attachment plan outputs (SAM arm only).
  let attachmentPdfs: Array<{ name: string; base64: string; buffer: Buffer }> | null = null;
  let primaryDocName: string | null = null;
  let ingestion: IngestionMeta | null = null;

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
    // FA-136 — deterministic form-first multi-attachment assembly (mirrors
    // the worker arm). Manifest failure or no ingestible primary falls
    // through to the legacy single-URL path unchanged.
    if (/^[a-f0-9]{32}$/i.test(solicitation.noticeId)) {
      const assembled: AssembledDocumentSet | null = await assembleSamDocumentSet(solicitation.noticeId, solicitation.solicitationNumber).catch(() => null);
      if (assembled?.primary) {
        pdfBase64 = assembled.primary.base64;
        pdfBuffer = assembled.primary.buffer;
        pdfSource = "sam_fetched";
        attachmentPdfs = assembled.attachments;
        primaryDocName = assembled.primary.name;
        ingestion = assembled.ingestion;
        console.log(`[audit] FA-136: document set assembled · ${assembled.ingestion.files_ingested}/${assembled.ingestion.files_total} ingested · form_identified=${assembled.ingestion.form_identified}`);
      } else if (assembled) {
        ingestion = assembled.ingestion;
      }
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
          // FA-130: V2 shadow needs local bytes; the file_id alone starved
          // it. pdfBuffer is guaranteed null in this branch (no user upload).
          pdfBuffer = fetched.buffer ?? null;
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
    // FA-116: scope to non-user rows — a user-enqueued duplicate of this
    // notice_id would make .maybeSingle() throw on >1 row.
    const { data: pa } = await supabase
      .from("pending_audits")
      .select("agency")
      .eq("notice_id", solicitation.noticeId)
      .neq("source", "user")
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

  // ━━ Run three-call audit + persist + V2 shadow + corpus ━━
  // FA-116: pipeline body extracted to src/lib/audit-executor.ts so the
  // resident audit-worker runs the identical code. Behavior preserved,
  // including the historical persist-failure contract (500 with auditId,
  // row left in 'processing' — see AuditPersistError).
  try {
    const execResult = await executeAudit(supabase, audit.id, {
      solicitation,
      agency,
      pdfBuffer,
      pdfBase64,
      pdfFileId,
      imageBase64,
      imageMediaType,
      extractedText,
      extractedFormat,
      pdfSource,
      pdfUnavailableReason,
      attachmentPdfs,
      primaryDocName,
      ingestion
    });

    return NextResponse.json(
      {
        auditId: audit.id,
        // Slug for the /audit/[id] route — clients should prefer this over
        // auditId in URL construction so paste-shares don't leak the UUID.
        solicitationNumber: solicitation.solicitationNumber,
        status: "complete",
        recommendation: execResult.recommendation,
        score: execResult.compliance_score
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
    if (err instanceof AuditPersistError) {
      return NextResponse.json({ error: message, auditId: audit.id }, { status: 500 });
    }
    console.error("[audit POST] failed", { auditId: audit.id, message });
    await supabase
      .from("audits")
      .update({ status: "failed", error_message: message })
      .eq("id", audit.id);
    return NextResponse.json({ error: message, auditId: audit.id }, { status: 500 });
  }
}

// ━━ FA-116 — async enqueue (flag-gated, see branch in POST above) ━━
// Inserts the audits row under the caller's RLS session (authoritative owner
// record, same fields/order as the sync path) plus a pending_audits row with
// source='user' via the service-role client (pending_audits RLS grants
// authenticated users READ only — migration 011). The resident audit-worker
// claims the pending row and runs the same executeAudit() pipeline.
async function enqueueAsyncAudit(args: {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  userId: string;
  solicitation: Solicitation;
  pdfBuffer: Buffer | null;
  safeName: string | null;
  rate: { remaining: number; resetAt: number };
}) {
  const { supabase, userId, solicitation, pdfBuffer, safeName, rate } = args;

  // Uploaded PDFs go to the Files API before ANY insert — if the upload
  // fails, no rows exist and nothing was charged.
  let anthropicFileId: string | null = null;
  if (pdfBuffer) {
    try {
      const uploaded = await uploadPdfToFilesApi(pdfBuffer, safeName);
      anthropicFileId = uploaded.fileId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown upload error";
      return NextResponse.json(
        { error: `PDF upload failed: ${message}. Nothing was charged — please try again.` },
        { status: 502 }
      );
    }
  }

  // FA-132 — stash the bytes in Supabase Storage (bucket "audit-pdfs") so
  // the worker's V2 shadow pass can read them. The Files API refuses to
  // download UPLOADED files back (400 "File is not downloadable", verified
  // req_011CbytNVFqgY1KeB5HG8Rq2), so storage is the only bytes channel to
  // the worker. Best-effort: a storage failure must not block a paid run —
  // V1 reads the file_id; the worker logs loudly and skips V2 when pdf_path
  // is absent.
  let pdfPath: string | null = null;
  if (pdfBuffer) {
    const adminForStorage = getAdminClient();
    if (adminForStorage) {
      const key = `uploads/${Date.now()}-${(safeName || "document.pdf").replace(/[^\w.-]/g, "_")}`;
      const { error: storageErr } = await adminForStorage.storage
        .from("audit-pdfs")
        .upload(key, pdfBuffer, { contentType: "application/pdf", upsert: false });
      if (storageErr) {
        console.error(`[enqueue] FA-132 storage stash failed (V2 shadow will be skipped for this run): ${storageErr.message}`);
      } else {
        pdfPath = key;
      }
    }
  }

  // Agency resolution — mirror of the sync path (resolveAgency + sam-ingest
  // pending_audits fallback, scoped to non-user rows).
  let agency: string | null = resolveAgency(solicitation);
  if (!agency && solicitation.noticeId && !/^pdf-/i.test(solicitation.noticeId)) {
    const { data: pa } = await supabase
      .from("pending_audits")
      .select("agency")
      .eq("notice_id", solicitation.noticeId)
      .neq("source", "user")
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
      user_id: userId,
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

  const admin = getAdminClient();
  if (!admin) {
    await supabase
      .from("audits")
      .update({ status: "failed", error_message: "enqueue failed: service-role client unavailable" })
      .eq("id", audit.id);
    return NextResponse.json(
      { error: "Audit queue is unavailable. Nothing was charged — please try again.", auditId: audit.id },
      { status: 500 }
    );
  }

  const { error: enqueueErr } = await admin.from("pending_audits").insert({
    notice_id: solicitation.noticeId,
    solicitation_number: solicitation.solicitationNumber,
    title: solicitation.title,
    agency,
    naics_code: solicitation.naicsCode,
    set_aside: solicitation.typeOfSetAside,
    response_deadline: solicitation.responseDeadLine,
    pdf_url: solicitation.resourceLinks[0] ?? null,
    source: "user",
    status: "pending",
    user_id: userId,
    audit_id: audit.id,
    anthropic_file_id: anthropicFileId,
    pdf_filename: pdfBuffer ? safeName : null,
    // FA-132 — storage key for the worker's V2 bytes (null when the stash
    // failed or there was no upload; worker degrades to V1-only shadow-less).
    pdf_path: pdfPath
  });

  if (enqueueErr) {
    await supabase
      .from("audits")
      .update({ status: "failed", error_message: `enqueue failed: ${enqueueErr.message}` })
      .eq("id", audit.id);
    return NextResponse.json(
      { error: `Audit could not be queued: ${enqueueErr.message}`, auditId: audit.id },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      auditId: audit.id,
      solicitationNumber: solicitation.solicitationNumber,
      status: "queued"
    },
    {
      status: 202,
      headers: {
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": String(rate.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000))
      }
    }
  );
}

export async function GET() {
  return NextResponse.json({ status: "audit endpoint live" });
}
