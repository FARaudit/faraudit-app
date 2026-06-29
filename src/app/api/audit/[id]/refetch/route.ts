// POST /api/audit/[id]/refetch — one-click server-side SAM re-pull + re-audit.
//
// Wired to the [data-fetch] CTA in the preliminary-read verdict block when
// the classifier puts the audit in data-prelim-mode="fetch" (doc EXISTS on
// SAM but our original retrieval failed — oversize, network, etc.).
//
// Flow:
//   1. Auth + load the audit row (mirrors /audit/[id] auth — also honors the
//      curated HERO_AUDIT_ID service-role fallback so the demo audit is
//      re-fetchable for any signed-in user).
//   2. 24h idempotency check: if the row already has a real PDF source
//      (anything other than sam_unavailable) AND was refreshed within the
//      last 24h, return success without re-running the engine.
//      BYPASS: a POST body of { "force": true } skips this check so an
//      explicit user-triggered re-run always re-invokes the current engine.
//      The auto-watcher tick (POST with no body) still gets the cache.
//   3. Rate limit (shares the existing audit:<user.id> bucket — 10/hr).
//   4. fetchSolicitationByNoticeId() + assembleSamDocumentSet() to re-pull the
//      FULL form-first document set (ingestion meta + attachments), falling back
//      to a single fetchPdfFromSamUrl() doc. If no resourceLinks → 422.
//   5. executeAudit() (agentic V3) with the assembled manifest + primary doc.
//   6. UPDATE the audits row in place (replace, not new row — same id), refreshing
//      the SAM facts (title/agency/deadline/NAICS/set-aside) the masthead reads.
//   7. Return JSON the client uses to redirect / reload.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency, resolveOfficeLeaf } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { assembleSamDocumentSet, type AssembledDocumentSet, type IngestionMeta } from "@/lib/sam-attachments";
import { type PdfSource } from "@/lib/audit-engine"; // type-only (erased) — V1 runAudit is RETIRED here
import { executeAudit, type AuditExecutionInput } from "@/lib/audit-executor";
import { uploadPdfToFilesApi } from "@/lib/anthropic-files";
import { MAX_PDF_BYTES } from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// runAudit's three-call pipeline is the same 300s budget as the original
// POST /api/audit handler.
export const maxDuration = 300;

const PDF_FILES_API_THRESHOLD_BYTES = 20_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HERO_AUDIT_ID = "7e389f1a-0fc4-4ba2-8299-c86d23adb62a";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required (UUID)" }, { status: 400 });
  }

  // Optional { force?: boolean } body. Body is optional — auto-watcher ticks
  // POST with no body and inherit force=false. Explicit user re-runs send
  // { "force": true } to bypass the 24h cache and always re-invoke the engine.
  let force = false;
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { force?: boolean } | null;
    force = Boolean(body?.force);
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Rate limit shared with the main audit POST.
  const rate = checkRateLimit(`audit:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rate.retryAfter}s.`, retryAfter: rate.retryAfter },
      { status: 429 }
    );
  }

  // Load the audit row. Mirror /audit/[id]'s hero service-role fallback so the
  // curated demo audit is fetchable for any authed user.
  let audit: Record<string, unknown> | null = null;
  {
    const { data } = await supabase.from("audits").select("*").eq("id", id).single();
    audit = data as Record<string, unknown> | null;
  }
  if (!audit && id.toLowerCase() === HERO_AUDIT_ID) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data } = await adminClient.from("audits").select("*").eq("id", HERO_AUDIT_ID).single();
      audit = data as Record<string, unknown> | null;
    }
  }
  if (!audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  const compJson = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const currentPdfSource = String(compJson.pdf_source ?? "");
  const lastRefetchedAtRaw = compJson.last_refetched_at as string | undefined;
  const lastRefetchedAt = lastRefetchedAtRaw ? new Date(lastRefetchedAtRaw).getTime() : 0;

  // 24h idempotency: if the row was successfully refetched recently AND now
  // carries a real PDF source, skip the model call. Explicit { force: true }
  // bypasses so a user-triggered re-run always re-invokes the current engine.
  if (
    !force &&
    currentPdfSource !== "" &&
    currentPdfSource !== "sam_unavailable" &&
    lastRefetchedAt > Date.now() - TWENTY_FOUR_HOURS_MS
  ) {
    return NextResponse.json({
      auditId: audit.id,
      status: "already_fetched",
      pdfSource: currentPdfSource,
      lastRefetchedAt: lastRefetchedAtRaw,
      redirect: `/audit/${audit.id}`
    });
  }

  const noticeId = String(audit.notice_id ?? "");
  if (!noticeId) {
    return NextResponse.json({ error: "audit has no notice_id" }, { status: 422 });
  }
  if (!process.env.SAM_API_KEY) {
    return NextResponse.json({ error: "SAM API key not configured" }, { status: 503 });
  }

  // ━━ Re-pull SAM solicitation ━━
  const solicitation = await fetchSolicitationByNoticeId(noticeId);
  if (!solicitation) {
    return NextResponse.json({ error: "Solicitation not found on SAM.gov" }, { status: 404 });
  }
  if (solicitation.resourceLinks.length === 0) {
    // Still nothing fetchable. Update last_refetched_at so the user can't
    // hammer the button + return a clear signal the prelim mode should stay.
    const merged = { ...compJson, last_refetched_at: new Date().toISOString() };
    await supabase.from("audits").update({ compliance_json: merged }).eq("id", audit.id);
    return NextResponse.json(
      { error: "no document attached to this notice", refetched: false, redirect: `/audit/${audit.id}` },
      { status: 422 }
    );
  }

  // ━━ Re-pull the document SET ━━
  let pdfBuffer: Buffer | null = null;
  let pdfBase64: string | null = null;
  let pdfFileId: string | null = null;
  let imageBase64: string | null = null;
  let imageMediaType: "image/jpeg" | "image/png" | null = null;
  let extractedText: string | null = null;
  let extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null = null;
  let pdfSource: PdfSource = "sam_unavailable";
  let pdfUnavailableReason: string | null = null;
  let attachmentPdfs: Array<{ name: string; base64: string; buffer: Buffer }> | null = null;
  let primaryDocName: string | null = null;
  let ingestion: IngestionMeta | null = null;

  // R1 — assemble the FULL form-first multi-attachment set, identical to the main
  // customer POST. Without the manifest the agentic engine has no document set to
  // reconcile, so it forces documents_complete=false on every SAM refetch and
  // export-gates an otherwise clean report. Manifest failure / no primary falls
  // through to the legacy single-doc path below.
  if (/^[a-f0-9]{32}$/i.test(solicitation.noticeId)) {
    const assembled: AssembledDocumentSet | null = await assembleSamDocumentSet(solicitation.noticeId, solicitation.solicitationNumber).catch(() => null);
    if (assembled?.primary) {
      pdfBase64 = assembled.primary.base64;
      pdfBuffer = assembled.primary.buffer;
      pdfSource = "sam_fetched";
      attachmentPdfs = assembled.attachments;
      primaryDocName = assembled.primary.name;
      ingestion = assembled.ingestion;
    } else if (assembled) {
      ingestion = assembled.ingestion;
    }
  }

  // Fallback — single primary doc (mirrors the main route) when assembly yields no primary.
  if (!pdfBase64 && !pdfFileId) {
    try {
      const fetched = await fetchPdfFromSamUrl(solicitation.resourceLinks[0]);
      if (fetched.bytes > MAX_PDF_BYTES) {
        pdfUnavailableReason = `oversize (${(fetched.bytes / 1024 / 1024).toFixed(1)}MB > ${MAX_PDF_BYTES / 1024 / 1024}MB)`;
      } else if (fetched.kind === "pdf") {
        if (fetched.fileId) {
          pdfFileId = fetched.fileId;
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
      } else {
        extractedText = fetched.extractedText;
        extractedFormat = fetched.format;
        pdfSource = "sam_text_extracted";
      }
    } catch (err) {
      pdfUnavailableReason = err instanceof Error ? err.message.slice(0, 200) : "unknown fetch error";
    }
  }

  // If still no usable content, mark and return — the panel stays in fetch
  // mode but the user has fresh proof we tried.
  if (!pdfBase64 && !pdfFileId && !imageBase64 && !extractedText) {
    const merged = {
      ...compJson,
      last_refetched_at: new Date().toISOString(),
      pdf_unavailable_reason: pdfUnavailableReason ?? compJson.pdf_unavailable_reason
    };
    await supabase.from("audits").update({ compliance_json: merged }).eq("id", audit.id);
    return NextResponse.json(
      { error: pdfUnavailableReason ?? "fetch failed", refetched: false, redirect: `/audit/${audit.id}` },
      { status: 422 }
    );
  }

  // If a buffer > 20MB returned, route through the Files API like the main
  // POST handler does. (fetchPdfFromSamUrl already does that for sam_fetched
  // text path; uploaded path mirrors POST.)
  if (pdfBase64) {
    const buf = Buffer.from(pdfBase64, "base64");
    if (buf.length > PDF_FILES_API_THRESHOLD_BYTES) {
      const uploaded = await uploadPdfToFilesApi(buf, `sam-refetch-${noticeId}.pdf`);
      pdfFileId = uploaded.fileId;
      pdfBase64 = null;
      pdfSource = "sam_pdf_via_files_api";
    }
  }

  // ━━ Run the audit — the agentic V3 engine (same path as the main customer POST),
  // NOT the retired V1 runAudit. executeAudit fills the row in place (verdict +
  // engine='agentic_v3' marker + honest_fail/documents_complete). A tighter budget
  // leaves the 300s route headroom for the SAM/PDF prologue above. ━━
  const input: AuditExecutionInput = {
    solicitation,
    agency: resolveAgency(solicitation) || (audit.agency as string | null),
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
    ingestion,
    agenticBudgetMs: 200_000
  };
  let result;
  try {
    result = await executeAudit(supabase, audit.id as string, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // executeAudit replaced compliance_json with the V3 payload — merge back the refetch
  // bookkeeping the idempotency cache + UI read (last_refetched_at, pdf_source), and
  // refresh office_leaf (FA-151: keep the prior leaf if SAM omits the full path).
  {
    const { data: fresh } = await supabase.from("audits").select("compliance_json").eq("id", audit.id).single();
    const freshCj = (fresh?.compliance_json as Record<string, unknown> | null) ?? {};
    const { error: mergeErr } = await supabase
      .from("audits")
      .update({
        compliance_json: { ...freshCj, last_refetched_at: new Date().toISOString(), pdf_source: pdfSource },
        // R1 — refresh the SAM facts an amendment can move; the masthead reads these
        // columns, so a refetch-after-amendment must update them (fall back to the
        // prior value when SAM omits a field, never null out a known good value).
        title: solicitation.title || (audit.title as string | null),
        agency: input.agency,
        naics_code: solicitation.naicsCode ?? (audit.naics_code as string | null),
        set_aside: solicitation.typeOfSetAside ?? (audit.set_aside as string | null),
        posted_date: solicitation.postedDate ?? (audit.posted_date as string | null),
        response_deadline: solicitation.responseDeadLine ?? (audit.response_deadline as string | null),
        office_leaf: resolveOfficeLeaf(solicitation) ?? (audit.office_leaf as string | null)
      })
      .eq("id", audit.id);
    if (mergeErr) {
      // The audit itself succeeded; only the refetch bookkeeping failed. Surface but
      // don't fail the request — the report is already correct.
      console.warn(`[refetch] compliance_json merge-back failed for ${audit.id}: ${mergeErr.message}`);
    }
  }

  return NextResponse.json({
    auditId: audit.id,
    status: "refetched",
    pdfSource,
    recommendation: result.recommendation,
    score: result.compliance_score,
    redirect: `/audit/${audit.id}`
  });
}
