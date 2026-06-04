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
//   3. Rate limit (shares the existing audit:<user.id> bucket — 10/hr).
//   4. fetchSolicitationByNoticeId() + fetchPdfFromSamUrl() to re-pull the
//      SAM resource. If still no resourceLinks → 422 ("not fetchable").
//   5. runAudit() with the new pdfBase64 / pdfFileId / image / text.
//   6. UPDATE the audits row in place (replace, not new row — same id).
//   7. Return JSON the client uses to redirect / reload.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { runAudit, type PdfSource } from "@/lib/audit-engine";
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
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required (UUID)" }, { status: 400 });
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
  // carries a real PDF source, skip the model call.
  if (
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

  // ━━ Re-pull the PDF ━━
  let pdfBase64: string | null = null;
  let pdfFileId: string | null = null;
  let imageBase64: string | null = null;
  let imageMediaType: "image/jpeg" | "image/png" | null = null;
  let extractedText: string | null = null;
  let extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null = null;
  let pdfSource: PdfSource = "sam_unavailable";
  let pdfUnavailableReason: string | null = null;
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
    } else {
      extractedText = fetched.extractedText;
      extractedFormat = fetched.format;
      pdfSource = "sam_text_extracted";
    }
  } catch (err) {
    pdfUnavailableReason = err instanceof Error ? err.message.slice(0, 200) : "unknown fetch error";
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

  // ━━ Run the audit ━━
  let result;
  try {
    result = await runAudit({ solicitation, pdfBase64, pdfFileId, imageBase64, imageMediaType, extractedText, extractedFormat, pdfSource, pdfUnavailableReason });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // ━━ Update the audits row (replace, not new) ━━
  const persistedComplianceJson = {
    ...result.compliance.json,
    score_confidence: result.score_confidence ?? null,
    is_not_solicitation: result.is_not_solicitation ?? false,
    notice_type: solicitation.type ?? compJson.notice_type ?? null,
    last_refetched_at: new Date().toISOString()
  };

  const refreshedAgency = resolveAgency(solicitation) || (audit.agency as string | null);
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
      agency: refreshedAgency,
      title: solicitation.title ?? audit.title,
      response_deadline: solicitation.responseDeadLine ?? audit.response_deadline,
      status: "complete",
      completed_at: new Date().toISOString()
    })
    .eq("id", audit.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
