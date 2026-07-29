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
import { buildBidderProfileFromCapability } from "@/lib/audit-bidder-profile";
import { AGENTIC_V3_PRIMARY_ENABLED } from "@/lib/audit-executor-v3";
import { isAnthropicTransient } from "@/lib/anthropic-files";
import { fetchSolicitationByNoticeId, resolveAgency, resolveOfficeLeaf, type Solicitation } from "@/lib/sam";
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
  // Deploy self-verification (2026-06-19 · T2-1 truth fix 2026-07-07): print the live
  // engine at startup so a deploy proves which model+engine it runs from the logs alone
  // — no audit run, no metered tokens, no guessing from the DB default placeholder.
  // The live engine is AGENTIC V3 (the SOLE engine; V1/V2 were deleted — no fallback);
  // extraction + judgment both ride this one model. The old "(V1 extraction + V2
  // judgment)" tag lied to the operator about a runtime that no longer exists.
  console.log(`[audit-worker] ENGINE MODEL = ${CLAUDE_MODEL} · deploy=${process.env.RAILWAY_DEPLOYMENT_ID?.slice(0, 8) ?? "?"} · sha=${process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"} (agentic V3 — sole engine, V1/V2 deleted)`);
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
    // REFETCH DETECTION (2026-07-29, refetch→async) — the refetch route stamps
    // compliance_json.last_refetched_at at enqueue time, so a pre-run stamp
    // means this row re-runs an EXISTING audits row (a refetch), not a fresh
    // enqueue (whose compliance_json is null at this point). executeAudit
    // replaces compliance_json wholesale, so the stamp must be re-merged after
    // a successful run — the idempotency cache and the metadata-only classifier
    // both read it. JSON-path select keeps the read light (no v3 payload pull).
    let isRefetch = false;
    {
      const { data: preRow } = await supabase
        .from("audits")
        .select("stamp:compliance_json->last_refetched_at")
        .eq("id", row.audit_id)
        .maybeSingle();
      isRefetch = Boolean((preRow as { stamp?: unknown } | null)?.stamp);
    }
    const input = await buildInput(row);
    const result = await executeAudit(supabase, row.audit_id, input);
    // T1-2 — compare-and-set on status='processing'. Under a rolling deploy the
    // FA-149 reclaim path can hand this row to a replacement worker while this
    // one is still finishing; without the guard a late markProcessed would stomp
    // the replacement's claim (flip it to 'processed') AND delete the shared
    // stash out from under it. Guard + affected-row check: 0 rows back ⇒ we lost
    // the claim, so leave the row and its bytes to the current owner and exit.
    const { data: marked, error } = await supabase
      .from("pending_audits")
      .update({
        status: "processed",
        recommendation: result.recommendation,
        compliance_score: result.compliance_score,
        bid_no_bid: result.bid_recommendation,
        processed_at: new Date().toISOString()
      })
      .eq("id", row.id)
      .eq("status", "processing")
      .select("id");
    if (error) throw new Error(`markProcessed(${row.id}): ${error.message}`);
    if (!marked || marked.length === 0) {
      console.warn(`[audit-worker] claim lost for ${row.id} (no longer 'processing' — reclaimed under rolling deploy); skipping success write + storage cleanup`);
      return;
    }
    console.log(`[audit-worker] done ${label} · ${result.recommendation} · score=${result.compliance_score} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    // REFETCH BOOKKEEPING merge-back — executeAudit replaced compliance_json
    // with the V3 payload; re-stamp last_refetched_at + pdf_source (mirrors the
    // retired inline route's merge-back). Best-effort: the report itself is
    // already correct and durably persisted; only the refetch cache/classifier
    // bookkeeping is at stake. Runs only after we WON the markProcessed CAS, so
    // it can never stomp a replacement worker's run.
    if (isRefetch) {
      const { data: fresh } = await supabase.from("audits").select("compliance_json").eq("id", row.audit_id).single();
      const freshCj = (fresh?.compliance_json as Record<string, unknown> | null) ?? {};
      const { error: mbErr } = await supabase
        .from("audits")
        .update({ compliance_json: { ...freshCj, last_refetched_at: new Date().toISOString(), pdf_source: input.pdfSource } })
        .eq("id", row.audit_id);
      if (mbErr) console.warn(`[audit-worker] refetch bookkeeping merge-back failed for ${row.audit_id}: ${mbErr.message}`);
    }
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
      const marker = err instanceof TransientInputError ? "transient_input" : "anthropic_5xx_degraded";
      console.error(`[audit-worker] ${marker} ${label}: ${message} — releasing claim for re-run`);
      const released = await releaseClaim(row, `${marker}: ${message.slice(0, 400)}`);
      if (released) return;
      // Release failed twice — fall through to the loud terminal path rather
      // than leave the row in limbo.
      console.error(`[audit-worker] release failed for ${row.id} — falling back to terminal failure`);
    }
    console.error(`[audit-worker] failed ${label}: ${message}`);
    // Best-effort: flip the audits row too so the report page exits its
    // wait state.
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
// exhaust) or a transient input blip (T1-1 storage read): re-runnable, so the
// claim goes back to pending (bounded by the FA-149 attempt cap). 'fail' =
// everything else (bad input, SAM 404, persist errors): a re-run would hit the
// same wall, so fail terminally. Exported for the FA-147 gate suite.
export function decideRunFailureMode(err: unknown): "release" | "fail" {
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
  let liveSam = false;
  if (!/^pdf-/i.test(row.notice_id)) {
    try {
      solicitation = await fetchSolicitationByNoticeId(row.notice_id);
      liveSam = !!solicitation;
    } catch (err) {
      console.warn(`[audit-worker] SAM re-fetch failed for ${row.notice_id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!solicitation) solicitation = synthesizeFromRow(row);

  // REFETCH PARITY (2026-07-29, refetch→async) — refresh the SAM fact columns the
  // masthead reads from the LIVE record. The refetch route used to do this inline;
  // now the worker owns it for every live-SAM run. Facts-vs-analysis law: write
  // ONLY the facts the live record actually provides — never null a known-good
  // value (an amendment's new deadline lands; a sparse record keeps the old one).
  // For fresh enqueues this rewrites the values the route inserted seconds ago.
  if (liveSam && row.audit_id) {
    const factRefresh: Record<string, unknown> = {};
    const freshAgency = resolveAgency(solicitation);
    const freshOffice = resolveOfficeLeaf(solicitation);
    if (solicitation.title) factRefresh.title = solicitation.title;
    if (freshAgency) factRefresh.agency = freshAgency;
    if (solicitation.naicsCode) factRefresh.naics_code = solicitation.naicsCode;
    if (solicitation.typeOfSetAside) factRefresh.set_aside = solicitation.typeOfSetAside;
    if (solicitation.postedDate) factRefresh.posted_date = solicitation.postedDate;
    if (solicitation.responseDeadLine) factRefresh.response_deadline = solicitation.responseDeadLine;
    if (freshOffice) factRefresh.office_leaf = freshOffice;
    if (Object.keys(factRefresh).length > 0) {
      const { error: factErr } = await supabase.from("audits").update(factRefresh).eq("id", row.audit_id);
      if (factErr) console.warn(`[audit-worker] SAM fact refresh failed for ${row.audit_id} (non-fatal): ${factErr.message}`);
    }
  }

  let pdfBase64: string | null = null;
  let pdfBuffer: Buffer | null = null;
  let pdfFileId: string | null = null;
  let imageBase64: string | null = null;
  let imageMediaType: "image/jpeg" | "image/png" | null = null;
  let extractedText: string | null = null;
  let extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null = null;
  let pdfSource: PdfSource = "sam_unavailable";
  let pdfUnavailableReason: string | null = null;
  // FA-136 — multi-attachment plan outputs. `text` (Brain #624-1) carries the assembler's
  // already-extracted text so buildAgenticDocs skips a second parse+OCR pass.
  let attachmentPdfs: Array<{ name: string; base64: string; buffer: Buffer; text?: string }> | null = null;
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
      // Reuse the primary form's already-extracted text (Brain #624-1) so buildAgenticDocs
      // does not parse+OCR the primary a second time. null when truncated/image-only ⇒
      // re-extracted downstream exactly as before.
      extractedText = assembled.primary.text ?? null;
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
    // T1-1 — the enqueue route stashes the uploaded bytes in Supabase Storage
    // (the Files API refuses to download uploaded files back) and records the
    // key in pdf_path. Under the live V3 engine those stashed bytes ARE the
    // audit input: V3 reads pdfBuffer/pdfBase64 and IGNORES pdfFileId (only the
    // retired V1 ever consumed a file_id directly). So a failed download is NOT
    // a skippable "V2 shadow" — it starves the whole run. Handle it honestly:
    //   • download blip on an existing key → TransientInputError (release+retry,
    //     bounded by the FA-149 attempt cap; the stash is deleted only on success)
    //   • no pdf_path at all (legacy pre-FA-132 row / stash failure) → terminal
    //     fail with a correct reason — re-running hits the same wall and V3 has
    //     no other source for a file_id-only upload.
    if (row.pdf_path) {
      const { data: blob, error: dlErr } = await supabase.storage.from("audit-pdfs").download(row.pdf_path);
      if (dlErr || !blob) {
        throw new TransientInputError(`T1-1: uploaded bytes unreadable from storage (${row.pdf_path}) — V3 input starved: ${dlErr?.message ?? "empty blob"}`);
      }
      pdfBuffer = Buffer.from(await blob.arrayBuffer());
    } else {
      throw new Error(`T1-1: file_id-only upload row ${row.id} has no stashed bytes (pdf_path null); the live V3 engine cannot read a Files API file_id, so there is no audit input`);
    }
  } else {
    // FA-136 — multi-attachment plan first: deterministic form-first
    // assembly from the v3 resources manifest. Manifest failure or no
    // ingestible primary → legacy single-URL path exactly as pre-FA-136
    // (assembled stays null → ingestion meta null → no banner).
    let assembled: AssembledDocumentSet | null = null;
    if (/^[a-f0-9]{32}$/i.test(row.notice_id)) {
      // PRE-PANEL TIMING (card #567) — SAM document-set retrieval (manifest + per-attachment download + text extract) is
      // the "retrieval" phase, OUTSIDE the 270s engine budget. Timing it proves whether retrieval (vs the in-budget
      // engine) drives wall-clock, and whether upload-direct — which skips this — would complete under budget. Log-only.
      const _tSamDl = Date.now();
      assembled = await assembleSamDocumentSet(row.notice_id, row.solicitation_number).catch((err) => {
        console.warn(`[audit-worker] FA-136: document-set assembly failed for ${row.notice_id} — legacy single-URL path: ${err instanceof Error ? err.message : err}`);
        return null;
      });
      if (process.env.AUDIT_TIMING_PREPANEL === "true") console.log(`[timing] prepanel:sam-retrieval(assembleSamDocumentSet) ${Date.now() - _tSamDl}ms · ${assembled ? `${assembled.ingestion.files_ingested}/${assembled.ingestion.files_total} docs` : "failed→legacy"}`);
    }
    if (assembled?.primary) {
      pdfBase64 = assembled.primary.base64;
      pdfBuffer = assembled.primary.buffer;
      pdfSource = "sam_fetched";
      attachmentPdfs = assembled.attachments;
      // Reuse the primary form's already-extracted text (Brain #624-1) — see upload arm.
      extractedText = assembled.primary.text ?? null;
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
    // NO-SILENT-DEGRADE (ROOT-1, Brain #648/#649 — the PROD async path; the route guard is dead behind the
    // 202 enqueue, this is where the seq-4 8ca6d7d4 degrade actually happened). assembled===null means the
    // manifest was UNAVAILABLE (fetch exhausted after retries) — NOT "readable-but-oversize" (that keeps
    // ingestion set above and its legacy read). For a MULTI-DOC package (resourceLinks>1) a single-URL read
    // of resourceLinks[0] would silently drop the other N-1 KNOWN docs and let the engine verdict on 1/N →
    // refuse it; route to honest-unavailable → INCOMPLETE, never a verdict on a partial read.
    const manifestUnavailable = assembled === null && solicitation.resourceLinks.length > 1 && /^[a-f0-9]{32}$/i.test(row.notice_id);
    if (manifestUnavailable) {
      pdfUnavailableReason = `multi-doc manifest unavailable (after retries) — ${solicitation.resourceLinks.length} resources expected; refused single-doc degrade (would drop ${solicitation.resourceLinks.length - 1})`;
      console.warn(`[audit-worker] NO-SILENT-DEGRADE: notice=${row.notice_id} resourceLinks=${solicitation.resourceLinks.length} · manifest unavailable → INCOMPLETE (refused single-doc fallback)`);
    }
    const docUrl = manifestUnavailable ? null : (row.pdf_url ?? solicitation.resourceLinks[0] ?? null);
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

  // N5 — the auditing firm's capability profile (open-world; socioeconomic certs only).
  // Mirror the sync route so the eligibility lane fires on the ASYNC/worker path too
  // (else N5 is inert whenever AUDIT_ASYNC_ENQUEUE is the live path). Only when the
  // agentic primary owns the report; best-effort → null (unknown firm) on any error.
  let bidderProfile = null;
  if (AGENTIC_V3_PRIMARY_ENABLED && row.user_id) {
    try {
      const { data: capRow } = await supabase
        .from("capability_statements")
        .select("certifications, attributes_v2, size_facts")
        .eq("user_id", row.user_id)
        .maybeSingle();
      // solicitation is non-null here (synthesizeFromRow fallback above) — V2 wiring must match the
      // sync route EXACTLY (verification F1: this constructor was the fourth site; missing it left the
      // authoritative records unloaded on the live async path, so verified certs decided on the route
      // path but stayed unknown on worker audits — the refetch no-divergence contract broke).
      bidderProfile = buildBidderProfileFromCapability(capRow, { solicitationNaics: solicitation.naicsCode });
    } catch { /* unknown firm on any error — never block the audit */ }
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
    ingestion,
    bidderProfile
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
    active: null, // degraded/re-fetch path — live SAM currency unknown (temporal gate → INDETERMINATE)
    description: row.pdf_filename
      ? `(PDF upload: ${row.pdf_filename} — Claude reads attached document directly.)`
      : "",
    resourceLinks: row.pdf_url ? [row.pdf_url] : []
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
