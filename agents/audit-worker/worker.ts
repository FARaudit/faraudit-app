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
import { executeAudit, DegradedRunError, type AuditExecutionInput } from "@/lib/audit-executor";
import { isAnthropicTransient } from "@/lib/anthropic-files";
import { fetchSolicitationByNoticeId, type Solicitation } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { assembleSamDocumentSet, assembleUploadedDocumentSet, deriveSolTokenFromFilenames, type AssembledDocumentSet } from "@/lib/sam-attachments";
import { MAX_PDF_BYTES } from "@/lib/validators";
import { type PdfSource, CLAUDE_MODEL } from "@/lib/audit-engine";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 10_000);
const STALE_PROCESSING_MS = 30 * 60 * 1000;
const kStaleMessage = "worker timeout (processing >30min)";
// FA-149 — drain + reclaim tuning.
// HEARTBEAT_MS: liveness beat while a run is in flight.
// RECLAIM_STALE_MS: 3 minutes = 6 missed 30s beats. The beat is a bare
//   single-row UPDATE on an interval timer, so it survives engine/API stalls
//   — 6 consecutive misses means the PROCESS is gone (SIGKILL/OOM), not slow.
//   Minutes-scale reclaim vs the legacy 30-minute sweep is the FA-149 ask.
// DRAIN_DEADLINE_MS: Railway sends SIGTERM and SIGKILLs after its fixed
//   ~10s stop grace (no railway.toml knob exists to raise it — verified
//   against config-as-code schema). A typical audit run needs minutes, so
//   completing in-window is impossible by design; the drain path RELEASES
//   the claim instead (single UPDATE, <2s) and the replacement container
//   re-runs it. 8s self-deadline leaves margin under the platform SIGKILL.
// MAX_ATTEMPTS: a row released/reclaimed 3 times is a poison pill (e.g. a
//   PDF that OOMs the worker) — fail it rather than crash-loop forever.
// WORKER_SOURCE: consumer-set override for test isolation ONLY (the FA-149
//   verification suite claims source='fa149_test' fixtures so it can never
//   race the production worker on source='user' rows).
const HEARTBEAT_MS = 30_000;
const RECLAIM_STALE_MS = Number(process.env.WORKER_RECLAIM_STALE_MS || 180_000);
const DRAIN_DEADLINE_MS = 8_000;
const MAX_ATTEMPTS = 3;
const SOURCE = process.env.WORKER_SOURCE || "user";

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
  // FA-132 — Supabase Storage key for the worker's V2 bytes (upload arm).
  pdf_path: string | null;
  // FA-178 — full multi-file upload set; the worker downloads every member and
  // re-assembles the form-first document set. Null on single-doc / SAM rows.
  upload_docs: Array<{ path: string; filename: string }> | null;
  created_at: string;
  // FA-149 — present once migration 20260612210000 is applied.
  heartbeat_at?: string | null;
  attempts?: number | null;
}

// FA-149 drain state — the signal handler and the claim loop share these.
let draining = false;
let inFlightRow: UserPendingRow | null = null;
let fa149Columns = false;

// Probe for the FA-149 columns (heartbeat_at / attempts). Pre-migration the
// worker degrades gracefully: SIGTERM release still works (existing columns
// only), orphan reclaim stays off and the legacy 30-min sweep covers crashes.
let probeWarned = false;
export async function probeFa149Columns(): Promise<boolean> {
  const wasActive = fa149Columns;
  const { error } = await supabase
    .from("pending_audits")
    .select("id, heartbeat_at, attempts")
    .limit(1);
  fa149Columns = !error;
  if (!fa149Columns && !probeWarned) {
    probeWarned = true;
    console.warn("[audit-worker] FA-149 columns absent (migration 20260612210000 pending) — orphan reclaim INACTIVE, legacy 30-min sweep only");
  }
  if (fa149Columns && !wasActive && probeWarned) {
    console.log("[audit-worker] FA-149 columns detected — orphan reclaim ACTIVATED (live migration apply)");
  }
  return fa149Columns;
}

// Release a held claim back to 'pending' so the replacement container picks
// it up. Used by the SIGTERM drain path; reclaimOrphans applies the same
// semantics to dead workers' claims. NEVER exits silently on failure — a
// claim held past exit is exactly the f0da5b1a incident class.
export async function releaseClaim(row: UserPendingRow, reason: string): Promise<boolean> {
  const payload: Record<string, unknown> = {
    status: "pending",
    claimed_at: null,
    error_message: reason.slice(0, 500)
  };
  if (fa149Columns) {
    payload.heartbeat_at = null;
    payload.attempts = (row.attempts ?? 0) + 1;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabase
      .from("pending_audits")
      .update(payload)
      .eq("id", row.id)
      .eq("status", "processing");
    if (!error) {
      console.log(`[audit-worker] claim released · ${row.id} · ${reason}`);
      return true;
    }
    console.error(`[audit-worker] releaseClaim(${row.id}) attempt ${attempt} failed: ${error.message}`);
  }
  return false;
}

// FA-149 — drain on SIGTERM/SIGINT (Railway deploy stop). Stop claiming
// immediately; release any held claim; exit clean. Hard 8s self-deadline so
// we always exit before the platform SIGKILL (~10s) — a forced exit with the
// release already attempted twice beats holding the claim into SIGKILL.
async function drainAndExit(signal: string): Promise<never> {
  draining = true;
  console.log(`[audit-worker] ${signal} received — draining (no new claims)`);
  const forced = setTimeout(() => {
    console.error(`[audit-worker] drain deadline (${DRAIN_DEADLINE_MS}ms) — forced exit`);
    process.exit(1);
  }, DRAIN_DEADLINE_MS);
  if (inFlightRow) {
    await releaseClaim(inFlightRow, `released: ${signal} drain (deploy) — replacement container will re-run`);
    inFlightRow = null;
  }
  clearTimeout(forced);
  console.log("[audit-worker] drain complete — exiting clean");
  process.exit(0);
}

export async function runWorker(): Promise<never> {
  process.once("SIGTERM", () => { void drainAndExit("SIGTERM"); });
  process.once("SIGINT", () => { void drainAndExit("SIGINT"); });
  await probeFa149Columns();
  console.log(`[audit-worker] up · poll=${POLL_MS}ms · stale_cutoff=${STALE_PROCESSING_MS / 60000}min · drain handler registered · reclaim=${fa149Columns ? `ACTIVE (stale>${RECLAIM_STALE_MS / 1000}s, cap ${MAX_ATTEMPTS})` : "inactive (migration pending)"}`);
  // Deploy self-verification (2026-06-19): print the live engine model at startup
  // so a deploy proves which model it runs from the logs alone — no audit run, no
  // metered tokens, no guessing from the DB default placeholder. V2 judgment is
  // threaded from this same constant (MI-1), so this one line covers both layers.
  console.log(`[audit-worker] ENGINE MODEL = ${CLAUDE_MODEL} · deploy=${process.env.RAILWAY_DEPLOYMENT_ID?.slice(0, 8) ?? "?"} · sha=${process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"} (V1 extraction + V2 judgment)`);
  // Boot reclaim pass — a redeploy replaced a container that may have died
  // holding a claim; reclaim it before the first poll.
  await reclaimOrphans().catch((err) => console.error("[audit-worker] boot reclaim error:", err instanceof Error ? err.message : err));
  for (;;) {
    if (draining) { await sleep(POLL_MS); continue; }
    try {
      await sweepStale();
      await reclaimOrphans();
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

// FA-149 — fast orphan reclaim. A processing row whose heartbeat is stale
// belongs to a worker that died without draining (SIGKILL, OOM). Flip it
// back to 'pending' in minutes — or to 'failed' at the attempt cap, so a
// poison-pill row that keeps killing workers cannot crash-loop. Inactive
// pre-migration (no heartbeat to judge by); the legacy sweep covers that era.
export async function reclaimOrphans(): Promise<number> {
  // Re-probe while inactive: applying migration 20260612210000 to a LIVE
  // deployment activates reclaim within one poll cycle — no restart needed.
  if (!fa149Columns && !(await probeFa149Columns())) return 0;
  const staleCutoff = new Date(Date.now() - RECLAIM_STALE_MS).toISOString();
  const { data: stale, error } = await supabase
    .from("pending_audits")
    .select("id, audit_id, attempts, heartbeat_at, solicitation_number, notice_id")
    .eq("source", SOURCE)
    .eq("status", "processing")
    .not("heartbeat_at", "is", null)
    .lt("heartbeat_at", staleCutoff);
  if (error) throw new Error(`reclaimOrphans select: ${error.message}`);
  if (!stale || stale.length === 0) return 0;

  let reclaimed = 0;
  for (const row of stale as UserPendingRow[]) {
    const nextAttempts = (row.attempts ?? 0) + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      const reason = `orphan reclaim: attempt cap (${MAX_ATTEMPTS}) reached — poison-pill guard`;
      const { error: failErr } = await supabase
        .from("pending_audits")
        .update({ status: "failed", error_message: reason, processed_at: new Date().toISOString(), heartbeat_at: null, attempts: nextAttempts })
        .eq("id", row.id)
        .eq("status", "processing");
      if (failErr) { console.error(`[audit-worker] reclaim-cap(${row.id}): ${failErr.message}`); continue; }
      if (row.audit_id) {
        await supabase.from("audits").update({ status: "failed", error_message: reason }).eq("id", row.audit_id).eq("status", "processing");
      }
      console.warn(`[audit-worker] reclaim CAP · ${row.id} · ${row.solicitation_number || row.notice_id} → failed (${MAX_ATTEMPTS} attempts)`);
      reclaimed++;
      continue;
    }
    const { error: relErr } = await supabase
      .from("pending_audits")
      .update({ status: "pending", claimed_at: null, heartbeat_at: null, attempts: nextAttempts, error_message: "reclaimed: stale heartbeat (worker died mid-run)" })
      .eq("id", row.id)
      .eq("status", "processing");
    if (relErr) { console.error(`[audit-worker] reclaim(${row.id}): ${relErr.message}`); continue; }
    console.log(`[audit-worker] reclaim · ${row.id} · ${row.solicitation_number || row.notice_id} → pending (attempt ${nextAttempts}/${MAX_ATTEMPTS})`);
    reclaimed++;
  }
  return reclaimed;
}

// Rows stuck in 'processing' past the cutoff (worker crash/redeploy mid-audit)
// flip to failed on both tables so the report page exits its wait state.
// FA-149: once the heartbeat columns exist, this legacy sweep only covers
// rows claimed WITHOUT a heartbeat (pre-migration claims) — heartbeated rows
// are reclaimOrphans' domain, and a live >30min run must not be killed here.
async function sweepStale(): Promise<void> {
  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  let q = supabase
    .from("pending_audits")
    .update({ status: "failed", error_message: kStaleMessage, processed_at: nowIso })
    .eq("source", SOURCE)
    .eq("status", "processing")
    .lt("claimed_at", cutoff);
  if (fa149Columns) q = q.is("heartbeat_at", null);
  const { data: swept, error } = await q.select("id, audit_id");
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
export async function claimNext(): Promise<UserPendingRow | null> {
  if (draining) return null; // FA-149 — a draining worker never claims
  const { data: candidates, error } = await supabase
    .from("pending_audits")
    .select("*")
    .eq("source", SOURCE)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`claimNext select: ${error.message}`);
  if (!candidates || candidates.length === 0) return null;

  const cand = candidates[0] as UserPendingRow;
  // FA-149 — belt to reclaimOrphans' cap: a pending row already at the
  // attempt ceiling (released/reclaimed by other worker generations) fails
  // here instead of claiming a fourth run.
  if (fa149Columns && (cand.attempts ?? 0) >= MAX_ATTEMPTS) {
    await markFailed(cand.id, `attempt cap (${MAX_ATTEMPTS}) reached before claim — poison-pill guard`);
    if (cand.audit_id) {
      await supabase.from("audits").update({ status: "failed", error_message: `attempt cap (${MAX_ATTEMPTS}) reached` }).eq("id", cand.audit_id).eq("status", "processing");
    }
    return null;
  }
  const claimPayload: Record<string, unknown> = { status: "processing", claimed_at: new Date().toISOString() };
  if (fa149Columns) claimPayload.heartbeat_at = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from("pending_audits")
    .update(claimPayload)
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

  // FA-149 — drain bookkeeping + liveness beat. inFlightRow lets the SIGTERM
  // handler release this claim; the 30s heartbeat lets a replacement worker
  // reclaim it in minutes if this process dies without draining (SIGKILL/OOM).
  inFlightRow = row;
  const beat = fa149Columns
    ? setInterval(() => {
        void supabase
          .from("pending_audits")
          .update({ heartbeat_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("status", "processing")
          .then(({ error }) => { if (error) console.error(`[audit-worker] heartbeat(${row.id}): ${error.message}`); });
      }, HEARTBEAT_MS)
    : null;

  try {
    // FA-160 — mark retrieval; the PDF/SAM fetch happens inside buildInput.
    await supabase
      .from("audits")
      .update({ current_stage: "retrieval", stage_updated_at: new Date().toISOString() })
      .eq("id", row.audit_id);
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
    // FA-132 — storage hygiene: the stashed bytes served their purpose once
    // the run completes. Best-effort delete on SUCCESS only — failed rows
    // keep their bytes (forensics + a released claim's re-run needs them).
    // FA-178 — the multi-doc set lives under upload_docs (one key per member);
    // single-doc V2 bytes live under pdf_path. Clean up whichever applies.
    const stashedKeys = row.upload_docs && row.upload_docs.length > 0
      ? row.upload_docs.map((d) => d.path)
      : row.pdf_path ? [row.pdf_path] : [];
    if (stashedKeys.length > 0) {
      const { error: rmErr } = await supabase.storage.from("audit-pdfs").remove(stashedKeys);
      if (rmErr) console.warn(`[audit-worker] storage cleanup failed for ${stashedKeys.join(", ")}: ${rmErr.message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // FA-147 — transient Anthropic failure (5xx exhaust on upload or any
    // engine call) or a structurally collapsed run: RELEASE the claim via the
    // FA-149 path instead of failing. The replacement attempt re-runs it;
    // attempts+1 means the poison-pill cap (3) naturally bounds retries
    // against a long outage. The reason lands on the pending_audits row —
    // diagnosable without log archaeology. The audits row stays 'processing'
    // (report page keeps waiting); the cap path fails both if it triggers.
    const mode = decideRunFailureMode(err);
    if (mode === "release") {
      const marker = err instanceof DegradedRunError ? "degraded_run_shape" : "anthropic_5xx_degraded";
      console.error(`[audit-worker] ${marker} ${label}: ${message} — releasing claim for re-run`);
      const released = await releaseClaim(row, `${marker}: ${message.slice(0, 400)}`);
      if (released) return;
      // Release failed twice — fall through to the loud terminal path rather
      // than leave the row in limbo.
      console.error(`[audit-worker] release failed for ${row.id} — falling back to terminal failure`);
    }
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
  } finally {
    // FA-149 — stop the beat and clear drain state. inFlightRow may already
    // be null if the SIGTERM handler released the claim mid-run.
    if (beat) clearInterval(beat);
    if (inFlightRow?.id === row.id) inFlightRow = null;
  }
}

// FA-147 — failure routing. 'release' = transient upstream (Anthropic 5xx
// exhaust) or structurally collapsed output: re-runnable, so the claim goes
// back to pending (bounded by the FA-149 attempt cap). 'fail' = everything
// else (bad input, SAM 404, persist errors): a re-run would hit the same
// wall, so fail terminally. Exported for the FA-147 gate suite.
export function decideRunFailureMode(err: unknown): "release" | "fail" {
  if (err instanceof DegradedRunError) return "release";
  if (err instanceof TransientInputError) return "release";
  if (isAnthropicTransient(err)) return "release";
  return "fail";
}

// FA-178 — a transient failure assembling the run input (e.g. a Storage read
// blip on a multi-doc member). The stashed bytes are NOT deleted until the run
// succeeds, so re-running is safe; release the claim instead of failing the
// paid run terminally. Bounded by the FA-149 attempt cap like any release.
export class TransientInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientInputError";
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
  // FA-136 — multi-attachment plan outputs.
  let attachmentPdfs: Array<{ name: string; base64: string; buffer: Buffer }> | null = null;
  let primaryDocName: string | null = null;
  let ingestion: import("@/lib/sam-attachments").IngestionMeta | null = null;

  if (row.upload_docs && row.upload_docs.length > 0) {
    // FA-178 — multi-file upload set. Download every member from Storage and
    // run the IDENTICAL form-first assembly the sync route runs
    // (assembleUploadedDocumentSet) — same primary, same attachments, same
    // ingestion-completeness meta — so the async path matches sync byte-for-
    // byte. These bytes ARE the audit input (not a best-effort V2 shadow), so
    // a missing member is fatal: a partial set would silently drop documents.
    const localFiles: { name: string; buffer: Buffer }[] = [];
    for (const doc of row.upload_docs) {
      const { data: blob, error: dlErr } = await supabase.storage.from("audit-pdfs").download(doc.path);
      if (dlErr || !blob) {
        throw new TransientInputError(`FA-178: upload-set member unreadable from storage (${doc.path}): ${dlErr?.message ?? "empty blob"}`);
      }
      localFiles.push({ name: doc.filename, buffer: Buffer.from(await blob.arrayBuffer()) });
    }
    // FA-E2E Fix 4 — the DB solicitation_number column is null on uploads, so
    // derive a sol token from the uploaded filenames (mirroring the sync route)
    // and prefer it; without it the solNorm rescue in isForm is dead on the
    // async path and an amendment-named primary never resolves to a FORM.
    const solTok = row.solicitation_number || deriveSolTokenFromFilenames(localFiles.map((f) => f.name));
    const assembled = await assembleUploadedDocumentSet(localFiles, solTok);
    ingestion = assembled.ingestion;
    if (assembled.primary) {
      pdfBase64 = assembled.primary.base64;
      pdfBuffer = assembled.primary.buffer;
      pdfSource = "uploaded";
      attachmentPdfs = assembled.attachments;
      primaryDocName = assembled.primary.name;
      console.log(`[audit-worker] FA-178: upload set assembled · ${ingestion.files_ingested}/${ingestion.files_total} ingested · primary=${primaryDocName} · form_identified=${ingestion.form_identified}`);
    } else {
      // Defensive: nothing ingestible (every member dropped by the page
      // ceiling) — proceed single-doc on the first member rather than fail,
      // mirroring the sync path's fallback.
      pdfBuffer = localFiles[0].buffer;
      pdfBase64 = pdfBuffer.toString("base64");
      pdfSource = "uploaded";
    }
  } else if (row.anthropic_file_id) {
    pdfFileId = row.anthropic_file_id;
    pdfSource = "uploaded_pdf_via_files_api";
    // FA-132 — closes the FA-130 residual class: the V2 shadow needs local
    // bytes (file_id alone starves it), and the worker never saw the
    // multipart upload. The enqueue route stashes the bytes in Supabase
    // Storage (the Files API refuses to download uploaded files back) and
    // records the key in pdf_path. Loud but NON-fatal on failure: V1 reads
    // the file_id directly, and V2 is a shadow surface (FA-147 leaves shadow
    // errors swallowed by design) — failing a paid customer run over shadow
    // input would invert priorities. Legacy rows (pdf_path null, enqueued
    // before FA-132) degrade the same way.
    if (row.pdf_path) {
      const { data: blob, error: dlErr } = await supabase.storage.from("audit-pdfs").download(row.pdf_path);
      if (dlErr || !blob) {
        console.error(`[audit-worker] FA-132: storage download failed for ${row.pdf_path} — V2 shadow will be skipped this run: ${dlErr?.message ?? "empty blob"}`);
      } else {
        pdfBuffer = Buffer.from(await blob.arrayBuffer());
      }
    } else {
      console.warn(`[audit-worker] FA-132: no pdf_path on upload-arm row ${row.id} (pre-FA-132 enqueue or stash failure) — V2 shadow skipped`);
    }
  } else {
    // FA-136 — multi-attachment plan first: deterministic form-first
    // assembly from the v3 resources manifest. Manifest failure or no
    // ingestible primary → legacy single-URL path exactly as pre-FA-136
    // (assembled stays null → ingestion meta null → no banner).
    let assembled: AssembledDocumentSet | null = null;
    if (/^[a-f0-9]{32}$/i.test(row.notice_id)) {
      assembled = await assembleSamDocumentSet(row.notice_id, row.solicitation_number).catch((err) => {
        console.warn(`[audit-worker] FA-136: document-set assembly failed for ${row.notice_id} — legacy single-URL path: ${err instanceof Error ? err.message : err}`);
        return null;
      });
    }
    if (assembled?.primary) {
      pdfBase64 = assembled.primary.base64;
      pdfBuffer = assembled.primary.buffer;
      pdfSource = "sam_fetched";
      attachmentPdfs = assembled.attachments;
      primaryDocName = assembled.primary.name;
      ingestion = assembled.ingestion;
      console.log(`[audit-worker] FA-136: document set assembled · ${assembled.ingestion.files_ingested}/${assembled.ingestion.files_total} ingested · form_identified=${assembled.ingestion.form_identified} · primary=${assembled.primary.name}`);
    } else {
      if (assembled) {
        // Manifest readable but nothing ingestible (e.g. oversize form) —
        // keep the completeness flag, fall through to legacy for the bytes.
        ingestion = assembled.ingestion;
        console.warn(`[audit-worker] FA-136: manifest read but no ingestible primary (${assembled.ingestion.files_total} files) — legacy single-URL path with completeness flag`);
      }
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
        // FA-147 — a transient Anthropic failure (Files API 503 on the
        // oversize-PDF upload arm) is NOT "document unavailable". Laundering
        // it into pdfUnavailableReason shipped a794ca3b as a complete
        // metadata-only audit. Rethrow so processOne releases the claim.
        if (isAnthropicTransient(err)) throw err;
        pdfUnavailableReason = err instanceof Error ? err.message.slice(0, 200) : "unknown fetch error";
      }
    } else {
      pdfUnavailableReason =
        solicitation.resourceLinks.length === 0
          ? "no resourceLinks on SAM opportunity"
          : "missing PDF source";
    }
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
    pdfUnavailableReason,
    attachmentPdfs,
    primaryDocName,
    ingestion
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
