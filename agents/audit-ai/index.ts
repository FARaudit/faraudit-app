import { initSentry } from "./lib/sentry";
initSentry("audit-ai");

// Audit AI — Railway worker (cron 06:30 CT daily).
//
// Pulls 'pending' rows from pending_audits, downloads the document (local path
// for fixture runs · SAM.gov for live), runs the upgraded 3-call audit engine,
// and either logs the result (DRY_RUN) or writes to the corpus (LIVE).
//
// Document arms supported (via agents/audit-ai/pdf.ts):
//   PDF        → Claude document content block
//   image      → Claude vision content block (JPEG/PNG · FA-1 2026-05-17)
//   text       → injected into prompt (DOCX/XLSX/DOC/TXT)
//
// Env: ANTHROPIC_API_KEY · SAM_API_KEY · NEXT_PUBLIC_SUPABASE_URL ·
//      SUPABASE_SERVICE_ROLE_KEY · DRY_RUN · QUEUE_BATCH_SIZE · CLAUDE_TIMEOUT_MS

import dotenv from "dotenv";
import { fetchDocumentFromPath, fetchDocumentFromSam, kSamNonPdfError } from "./pdf.js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error("[audit-ai] missing one of NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY in env");
  process.exit(1);
}

// Dynamic imports AFTER env load — queue.ts and audit-engine.ts both capture
// env at module-init time, so static imports would fire too early.
// @ts-expect-error tsx runtime resolves .ts; tsc strict imports forbid the extension
const queueNs: any = await import("./queue.ts");
const queue = queueNs.default ?? queueNs;
const {fetchPending, markProcessing, markProcessed, markFailed, getCompletedCount } = queue;
type PendingAudit = import("./queue.ts").PendingAudit;

// @ts-expect-error see above
const corpusNs: any = await import("./corpus.ts");
const corpus = corpusNs.default ?? corpusNs;
const recordAudit = corpus.recordAudit;

// Engine + sam are vendored as sibling files (agents/audit-ai/audit-engine.ts
// and agents/audit-ai/sam.ts) because Railway's Root Directory = agents/audit-ai/
// means /app/ ships only this folder — no /app/src/ exists in the container.
// Cross-folder `../../src/lib/...` imports resolved to /src/lib/... and threw
// ERR_MODULE_NOT_FOUND at module load. Parity-locked with src/lib/ via header
// comments in the vendor files.
// @ts-expect-error see above
const engineNs: any = await import("./audit-engine.ts");
// @ts-expect-error see above
const samNs: any = await import("./sam.ts");

// Handle ESM/CJS interop quirk under tsx — runAudit and fetchSolicitationByNoticeId
// may be on .default depending on how tsx loaded the module.
const engine: any = (engineNs as any).default ?? engineNs;
const sam: any = (samNs as any).default ?? samNs;
const runAudit = engine.runAudit;
const fetchSolicitationByNoticeId = sam.fetchSolicitationByNoticeId;

if (typeof runAudit !== "function" || typeof fetchSolicitationByNoticeId !== "function") {
  console.error("[audit-ai] engine/sam exports not resolved", {
    engine: Object.keys(engineNs),
    sam: Object.keys(samNs)
  });
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN !== "false";  // default ON for safety
const BATCH_SIZE = Number(process.env.QUEUE_BATCH_SIZE) || 10;

  // ── CORPUS CEILING CHECK (added May 10 2026) ──
  const CORPUS_TARGET = Number(process.env.CORPUS_TARGET) || 1000;
  const completedCount = await getCompletedCount();
  console.log(`[audit-ai] corpus: ${completedCount} / ${CORPUS_TARGET} completed audits`);
  if ((completedCount || 0) >= CORPUS_TARGET) {
    console.log(`[audit-ai] corpus target ${CORPUS_TARGET} reached — pausing audit processing. Raise CORPUS_TARGET env var to resume.`);
    process.exit(0);
  }


function shorten(s: string | null | undefined, n: number): string {
  return ((s || "") + "").replace(/\s+/g, " ").slice(0, n);
}

// FA-2 (2026-05-17): ceiling raised 25MB → 500MB to match the Anthropic Files
// API per-upload limit. PDFs in (20MB, 500MB] are uploaded by pdf.ts to the
// Files API and the document content block references {type:"file", file_id}
// — the inline base64 32MB wire limit no longer applies. The cap survives as
// a sanity guard against absurd uploads (e.g. mis-detected non-PDF binary).
// Image and text-extracted arms still flow inline; they remain well under the
// inline cap so the 500MB constant doesn't loosen their effective ceiling.
const MAX_PDF_BYTES = 500 * 1024 * 1024;
const kPdfTooLargeError = "PDF exceeds 500MB Anthropic Files API limit";
const kNoPdfError = "pending_audit row has neither pdf_path nor pdf_url";

async function loadDocument(row: PendingAudit) {
  let result;
  if (row.pdf_path) result = await fetchDocumentFromPath(row.pdf_path);
  else if (row.pdf_url) result = await fetchDocumentFromSam(row.pdf_url);
  else throw new Error(kNoPdfError);
  if (result.bytes > MAX_PDF_BYTES) {
    throw new Error(`${kPdfTooLargeError} (${(result.bytes / 1024 / 1024).toFixed(1)}MB)`);
  }
  return result;
}

// Data-quality failures = rows that should have been filtered upstream (no PDF,
// PDF too large, SAM.gov returning non-PDF bytes for the download URL). These
// don't represent worker bugs · audit-ai exits 0 even when only data-quality
// failures fired. Genuine engine errors (timeout, API 4xx/5xx, schema mismatch)
// still exit 1 to surface as Railway alerts.
//
// kSamNonPdfError added 2026-05-08 (F-02): today's 06:30 CDT cron classified 12
// SAM-non-PDF rows as engine-failed, exited 1, deployment showed CRASHED in
// Railway despite ok=37/50. Prefix moved to pdf.ts so the sentinel string lives
// next to the throw site that emits it. FA-1 (2026-05-17) broadened pdf.ts's
// throw paths (OLE2-non-doc, unrecognized binary) but kept the kSamNonPdfError
// prefix on every one of them — the substring match below still fires correctly.
function isDataQualityFailure(message: string): boolean {
  return (
    message.includes(kNoPdfError) ||
    message.includes(kPdfTooLargeError) ||
    message.includes(kSamNonPdfError)
  );
}

async function processOne(row: PendingAudit, i: number, total: number): Promise<{ ok: boolean; reason?: string }> {
  const tag = `[${i + 1}/${total}] ${row.notice_id}`;
  console.log(`\n──── ${tag} ────`);
  console.log(`  source=${row.source} status=${row.status} title=${shorten(row.title, 80)}`);

  try {
    if (!DRY_RUN) await markProcessing(row.id);

    // Build the solicitation context. If the queue row has metadata, use it;
    // otherwise (live SAM ingestion path) fetch from SAM.gov by notice_id.
    let solicitation = await fetchSolicitationByNoticeId(row.notice_id);
    if (!solicitation) {
      // Synthesize from queue row when SAM lookup fails (offline / fixture mode).
      // Includes fullParentPathName + resourceLinks fields (added 2026-05-07
      // for Solicitation interface parity post-P0-A / P0-G).
      solicitation = {
        noticeId: row.notice_id,
        solicitationNumber: null,
        title: row.title || row.notice_id,
        department: row.agency,
        subTier: null,
        fullParentPathName: null,
        naicsCode: row.naics_code,
        type: null,
        typeOfSetAside: row.set_aside,
        postedDate: null,
        responseDeadLine: null,
        description: row.notes || `(seed row · pdf=${row.pdf_path || row.pdf_url})`,
        resourceLinks: []
      };
    }

    const doc = await loadDocument(row);

    // Format label per arm: PDF magic, image media type, or extracted text format.
    const formatLabel = doc.kind === "pdf" ? "pdf"
      : doc.kind === "image" ? doc.mediaType
      : doc.format;
    console.log(`  ${formatLabel}: ${doc.bytes.toLocaleString()} bytes from ${doc.source}`);

    // PdfSource derivation mirrors src/app/api/audit/route.ts for parity across
    // the worker (Railway) and user-facing (Vercel) entry points. Worker-side
    // semantics:
    //   doc.source="local" + pdf inline      → "uploaded"                    (fixture mode)
    //   doc.source="local" + pdf via Files   → "uploaded_pdf_via_files_api"  (FA-2)
    //   doc.source="sam.gov" + pdf inline    → "sam_fetched"
    //   doc.source="sam.gov" + pdf via Files → "sam_pdf_via_files_api"       (FA-2)
    //   doc.source="sam.gov" + image         → "sam_image_extracted"         (FA-1)
    //   doc.source="sam.gov" + text          → "sam_text_extracted"
    // Without this explicit derivation, runAudit's internal default labels every
    // PDF as "uploaded" — wrong for the worker (which never receives user
    // uploads). Pre-FA-1 the corpus consequently mis-labeled SAM-fetched PDFs;
    // this commit corrects forward but does NOT backfill historical rows.
    const isFilesApiPdf = doc.kind === "pdf" && !!doc.fileId;
    let pdfSource: string;
    if (doc.source === "local" && isFilesApiPdf) pdfSource = "uploaded_pdf_via_files_api";
    else if (doc.source === "local") pdfSource = "uploaded";
    else if (isFilesApiPdf) pdfSource = "sam_pdf_via_files_api";
    else if (doc.kind === "pdf") pdfSource = "sam_fetched";
    else if (doc.kind === "image") pdfSource = doc.resized ? "sam_image_resized" : "sam_image_extracted";
    else pdfSource = "sam_text_extracted";

    const t0 = Date.now();
    const result = await runAudit({
      solicitation,
      pdfBase64:      doc.kind === "pdf" && !doc.fileId ? doc.base64        : undefined,
      pdfFileId:      doc.kind === "pdf" ? doc.fileId   : undefined,
      imageBase64:    doc.kind === "image" ? doc.base64        : undefined,
      imageMediaType: doc.kind === "image" ? doc.mediaType     : undefined,
      extractedText:  doc.kind === "text"  ? doc.extractedText : undefined,
      extractedFormat: doc.kind === "text" ? doc.format        : undefined,
      pdfSource
    });
    const ms = Date.now() - t0;

    const c = result.compliance.json;
    const r = result.risks.json;
    const detected = (c.dfars_flags || []).filter((f: any) => f.detected).map((f: any) => f.clause);

    console.log(`  ✓ audit complete in ${ms}ms · ${result.classification.document_type} · ${result.recommendation} · score ${result.compliance_score}/100`);
    console.log(`    FAR=${(c.far_clauses || []).length} DFARS=${(c.dfars_clauses || []).length} certs=${(c.required_certifications || []).length} CLINs=${(c.clins || []).length}`);
    console.log(`    DFARS traps detected: ${detected.length ? detected.join(" · ") : "none"}`);
    console.log(`    risks: tech=${(r.technical_risks || []).length} sched=${(r.schedule_risks || []).length} price=${(r.price_risks || []).length} eval=${(r.evaluation_risks || []).length} prioritized=${(r.prioritized_risks || []).length}`);
    console.log(`    bid/no-bid: ${shorten(r.bid_no_bid_recommendation, 200)}`);

    if (DRY_RUN) {
      console.log(`  [DRY_RUN] no DB write — set DRY_RUN=false to persist`);
      return { ok: true };
    }

    const writeOut = await recordAudit({ solicitation, result });
    await markProcessed(row.id, {
      audit_id: writeOut.audit_id,
      recommendation: result.recommendation,
      compliance_score: result.compliance_score,
      bid_no_bid: r.bid_no_bid_recommendation || null
    });
    console.log(`  ✓ persisted · audits.id=${writeOut.audit_id} · corpus_rows=${writeOut.inserted_corpus_rows}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ FAILED: ${message}`);
    if (!DRY_RUN) {
      try { await markFailed(row.id, message); } catch (e) { /* swallow */ }
    }
    return { ok: false, reason: message };
  }
}

async function main() {
  const startedAt = new Date();
  console.log(`[audit-ai] start ${startedAt.toISOString()} · DRY_RUN=${DRY_RUN} · batch=${BATCH_SIZE}`);

  const rows = await fetchPending(BATCH_SIZE);
  if (rows.length === 0) {
    console.log("[audit-ai] queue empty — nothing to process");
    return;
  }
  console.log(`[audit-ai] queue: ${rows.length} pending row(s)`);

  let ok = 0;
  let failedDataQuality = 0;
  let failedEngine = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = await processOne(rows[i], i, rows.length);
    if (r.ok) ok++;
    else if (isDataQualityFailure(r.reason || "")) failedDataQuality++;
    else failedEngine++;
  }

  const finishedAt = new Date();
  console.log(`\n[audit-ai] done ${finishedAt.toISOString()} · processed=${rows.length} ok=${ok} data-quality-failed=${failedDataQuality} engine-failed=${failedEngine} duration=${finishedAt.getTime() - startedAt.getTime()}ms`);
  // Exit 1 only on genuine engine errors. Data-quality failures (no PDF, oversized PDF)
  // are upstream-filterable and don't indicate worker malfunction — they should
  // shrink to zero once sam-ingest's resourceLinks=null filter is in place.
  if (failedEngine > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[audit-ai] fatal", e);
  process.exit(1);
});
