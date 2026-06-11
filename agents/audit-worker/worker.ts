// FA-116 — resident worker loop for user-enqueued audits.
//
// Claims pending_audits rows with source='user' AND status='pending' (its own
// disjoint consumer set — agents/audit-ai's cron fetchPending excludes user
// rows, so there are no claim races across services). No response_deadline
// filter: auditing an expired solicitation is a supported user flow
// (closed-state report mode). No CORPUS_TARGET gate: user audits are paid
// product actions, never throttled by the corpus ceiling.
//
// Runs the IDENTICAL pipeline as the sync route via src/lib/audit-executor
// (V1 3-call → persist → V2 shadow → corpus) against the audits row that the
// route pre-attributed at enqueue time under the user's RLS session.

import { createClient } from "@supabase/supabase-js";
import { executeAudit, type AuditExecutionInput } from "@/lib/audit-executor";
import { fetchSolicitationByNoticeId, type Solicitation } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { MAX_PDF_BYTES } from "@/lib/validators";
import type { PdfSource } from "@/lib/audit-engine";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 10_000);
const STALE_PROCESSING_MS = 30 * 60 * 1000;
const kStaleMessage = "worker timeout (processing >30min)";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

interface UserPendingRow {
  id: string;
  notice_id: string;
  audit_id: string | null;
  user_id: string | null;
  solicitation_number: string | null;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  set_aside: string | null;
  response_deadline: string | null;
  pdf_url: string | null;
  anthropic_file_id: string | null;
  pdf_filename: string | null;
  created_at: string;
}

export async function runWorker(): Promise<never> {
  console.log(`[audit-worker] up · poll=${POLL_MS}ms · stale_cutoff=${STALE_PROCESSING_MS / 60000}min`);
  for (;;) {
    try {
      await sweepStale();
      const row = await claimNext();
      if (row) {
        await processOne(row);
        // Backlogged: look for the next row immediately, no idle sleep.
        continue;
      }
    } catch (err) {
      console.error("[audit-worker] loop error:", err instanceof Error ? err.message : err);
    }
    await sleep(POLL_MS);
  }
}

// Rows stuck in 'processing' past the cutoff (worker crash/redeploy mid-audit)
// flip to failed on both tables so the report page exits its wait state.
async function sweepStale(): Promise<void> {
  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: swept, error } = await supabase
    .from("pending_audits")
    .update({ status: "failed", error_message: kStaleMessage, processed_at: nowIso })
    .eq("source", "user")
    .eq("status", "processing")
    .lt("claimed_at", cutoff)
    .select("id, audit_id");
  if (error) throw new Error(`sweepStale(pending_audits): ${error.message}`);
  if (!swept || swept.length === 0) return;

  console.log(`[audit-worker] stale sweep · flipped ${swept.length} row(s) to failed`);
  const auditIds = swept.map((r) => r.audit_id).filter((id): id is string => !!id);
  if (auditIds.length > 0) {
    const { error: auErr } = await supabase
      .from("audits")
      .update({ status: "failed", error_message: kStaleMessage })
      .in("id", auditIds)
      .eq("status", "processing");
    if (auErr) console.error(`[audit-worker] sweepStale(audits): ${auErr.message}`);
  }
}

// Atomic claim: the UPDATE re-checks status='pending', so if anything else
// already claimed the row the affected count is 0 and we walk away.
async function claimNext(): Promise<UserPendingRow | null> {
  const { data: candidates, error } = await supabase
    .from("pending_audits")
    .select("*")
    .eq("source", "user")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`claimNext select: ${error.message}`);
  if (!candidates || candidates.length === 0) return null;

  const cand = candidates[0] as UserPendingRow;
  const { data: claimed, error: claimErr } = await supabase
    .from("pending_audits")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", cand.id)
    .eq("status", "pending")
    .select("id");
  if (claimErr) throw new Error(`claimNext claim(${cand.id}): ${claimErr.message}`);
  if (!claimed || claimed.length === 0) return null;
  return cand;
}

async function processOne(row: UserPendingRow): Promise<void> {
  const t0 = Date.now();
  const label = row.solicitation_number || row.notice_id;
  console.log(`[audit-worker] claimed ${row.id} · ${label} · audit_id=${row.audit_id}`);

  if (!row.audit_id) {
    await markFailed(row.id, "missing audit_id attribution on user-enqueued row");
    return;
  }

  try {
    const input = await buildInput(row);
    const result = await executeAudit(supabase, row.audit_id, input);
    const { error } = await supabase
      .from("pending_audits")
      .update({
        status: "processed",
        recommendation: result.recommendation,
        compliance_score: result.compliance_score,
        bid_no_bid: result.bid_recommendation,
        processed_at: new Date().toISOString()
      })
      .eq("id", row.id);
    if (error) throw new Error(`markProcessed(${row.id}): ${error.message}`);
    console.log(`[audit-worker] done ${label} · ${result.recommendation} · score=${result.compliance_score} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[audit-worker] failed ${label}: ${message}`);
    // Best-effort: flip the audits row too so the report page exits its
    // wait state. AuditPersistError lands here as well — in the worker
    // context a failed complete-update has no result to preserve.
    const { error: auErr } = await supabase
      .from("audits")
      .update({ status: "failed", error_message: message })
      .eq("id", row.audit_id);
    if (auErr) console.error(`[audit-worker] audits failed-flip error (${row.audit_id}): ${auErr.message}`);
    await markFailed(row.id, message);
  }
}

async function markFailed(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
      processed_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) console.error(`[audit-worker] markFailed(${id}): ${error.message}`);
}

// Reconstruct the executeAudit input the way the sync route builds it.
// Uploads carry an Anthropic Files API handle (all sizes — FA-116 enqueues
// via Files API since the worker never sees the multipart bytes); SAM-sourced
// audits re-fetch the notice live and download the document here.
async function buildInput(row: UserPendingRow): Promise<AuditExecutionInput> {
  let solicitation: Solicitation | null = null;
  if (!/^pdf-/i.test(row.notice_id)) {
    try {
      solicitation = await fetchSolicitationByNoticeId(row.notice_id);
    } catch (err) {
      console.warn(`[audit-worker] SAM re-fetch failed for ${row.notice_id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!solicitation) solicitation = synthesizeFromRow(row);

  let pdfBase64: string | null = null;
  let pdfBuffer: Buffer | null = null;
  let pdfFileId: string | null = null;
  let imageBase64: string | null = null;
  let imageMediaType: "image/jpeg" | "image/png" | null = null;
  let extractedText: string | null = null;
  let extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null = null;
  let pdfSource: PdfSource = "sam_unavailable";
  let pdfUnavailableReason: string | null = null;

  if (row.anthropic_file_id) {
    pdfFileId = row.anthropic_file_id;
    pdfSource = "uploaded_pdf_via_files_api";
  } else {
    const docUrl = row.pdf_url ?? solicitation.resourceLinks[0] ?? null;
    if (docUrl) {
      try {
        const fetched = await fetchPdfFromSamUrl(docUrl);
        if (fetched.bytes > MAX_PDF_BYTES) {
          pdfUnavailableReason = `oversize (${(fetched.bytes / 1024 / 1024).toFixed(1)}MB > ${MAX_PDF_BYTES / 1024 / 1024}MB)`;
        } else if (fetched.kind === "pdf") {
          if (fetched.fileId) {
            pdfFileId = fetched.fileId;
            // FA-130: V2 shadow needs local bytes; the file_id alone starved
            // it. Same Buffer reference fetchPdfFromSamUrl already holds.
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
    } else {
      pdfUnavailableReason =
        solicitation.resourceLinks.length === 0
          ? "no resourceLinks on SAM opportunity"
          : "missing PDF source";
    }
  }

  return {
    solicitation,
    agency: row.agency,
    pdfBuffer,
    pdfBase64,
    pdfFileId,
    imageBase64,
    imageMediaType,
    extractedText,
    extractedFormat,
    pdfSource,
    pdfUnavailableReason
  };
}

function synthesizeFromRow(row: UserPendingRow): Solicitation {
  return {
    noticeId: row.notice_id,
    solicitationNumber: row.solicitation_number,
    title: row.title || "Untitled solicitation",
    department: null,
    subTier: null,
    fullParentPathName: null,
    naicsCode: row.naics_code,
    type: null,
    typeOfSetAside: row.set_aside,
    postedDate: null,
    responseDeadLine: row.response_deadline,
    description: row.pdf_filename
      ? `(PDF upload: ${row.pdf_filename} — Claude reads attached document directly.)`
      : "",
    resourceLinks: row.pdf_url ? [row.pdf_url] : []
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
