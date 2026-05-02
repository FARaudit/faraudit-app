// Audit AI — Railway worker (cron 06:30 CT daily).
//
// Pulls 'pending' rows from pending_audits, downloads the PDF (local path
// for fixture runs · SAM.gov for live), runs the upgraded 3-call audit
// engine, and either logs the result (DRY_RUN) or writes to the corpus
// (LIVE).
//
// Env: ANTHROPIC_API_KEY · SAM_API_KEY · NEXT_PUBLIC_SUPABASE_URL ·
//      SUPABASE_SERVICE_ROLE_KEY · DRY_RUN · QUEUE_BATCH_SIZE · CLAUDE_TIMEOUT_MS

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { fetchPending, markProcessing, markProcessed, markFailed, type PendingAudit } from "./queue.js";
import { fetchPdfFromPath, fetchPdfFromSam } from "./pdf.js";
import { recordAudit } from "./corpus.js";

// Engine + sam imports use .ts paths because the worker runs under tsx.
// @ts-expect-error tsx resolves at runtime; TS strict imports don't permit .ts extensions
import * as engineNs from "../../src/lib/audit-engine.ts";
// @ts-expect-error see above
import * as samNs from "../../src/lib/sam.ts";

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

function shorten(s: string | null | undefined, n: number): string {
  return ((s || "") + "").replace(/\s+/g, " ").slice(0, n);
}

async function loadPdf(row: PendingAudit) {
  if (row.pdf_path) return fetchPdfFromPath(row.pdf_path);
  if (row.pdf_url) return fetchPdfFromSam(row.pdf_url);
  throw new Error("pending_audit row has neither pdf_path nor pdf_url");
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
      solicitation = {
        noticeId: row.notice_id,
        solicitationNumber: null,
        title: row.title || row.notice_id,
        department: row.agency,
        subTier: null,
        naicsCode: row.naics_code,
        type: null,
        typeOfSetAside: row.set_aside,
        postedDate: null,
        responseDeadLine: null,
        description: row.notes || `(seed row · pdf=${row.pdf_path || row.pdf_url})`
      };
    }

    const { base64, bytes, source } = await loadPdf(row);
    console.log(`  pdf: ${bytes.toLocaleString()} bytes from ${source}`);

    const t0 = Date.now();
    const result = await runAudit({ solicitation, pdfBase64: base64 });
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
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = await processOne(rows[i], i, rows.length);
    if (r.ok) ok++;
    else failed++;
  }

  const finishedAt = new Date();
  console.log(`\n[audit-ai] done ${finishedAt.toISOString()} · processed=${rows.length} ok=${ok} failed=${failed} duration=${finishedAt.getTime() - startedAt.getTime()}ms`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[audit-ai] fatal", e);
  process.exit(1);
});
