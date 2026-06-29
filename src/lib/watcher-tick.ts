// Watcher tick — the core of Phase 2.
//
// For each watched_notices row in status='watching', refetch the SAM
// solicitation, and if resourceLinks transitioned []→[url] (the
// solicitation posted) run the full audit pipeline, persist a new audits
// row owned by the watcher's user, flip the watched_notices status, write
// an in-app notification, and send the Resend email.
//
// Invoked from the Railway sam-ingest cron via a Bearer-authed POST to
// /api/internal/watcher-tick which calls runWatcherTick(). Designed to be
// idempotent (status is the gate — re-ticks against the same row no-op)
// and bounded (MAX_TICK_PER_RUN caps work-per-call so the cron never times
// out on a runaway watched list).
//
// Auth posture: this lib runs with service-role credentials. Caller is
// responsible for the gate (Bearer check inside the API route).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchSolicitationByNoticeId, resolveAgency, resolveOfficeLeaf, type Solicitation } from "@/lib/sam";
import { fetchPdfFromSamUrl } from "@/lib/sam-pdf";
import { assembleSamDocumentSet, type AssembledDocumentSet, type IngestionMeta } from "@/lib/sam-attachments";
import { uploadPdfToFilesApi } from "@/lib/anthropic-files";
import { MAX_PDF_BYTES } from "@/lib/validators";
import { type PdfSource } from "@/lib/audit-engine"; // type-only (erased) — V1 runAudit is RETIRED here
import { executeAudit, type AuditExecutionInput } from "@/lib/audit-executor";
import { buildBidderProfileFromCapability } from "@/lib/audit-bidder-profile";
import { sendWatcherPostedEmail } from "@/lib/email/watcher-posted";

const PDF_FILES_API_THRESHOLD_BYTES = 20_000_000;
const MAX_TICK_PER_RUN = 25;
// Each auto-audit now runs the full agentic V3 engine synchronously (≈270s budget).
// The watcher-tick route is a Vercel cron capped at maxDuration=300, so at most ONE
// agentic audit fits per tick. []→[url] transitions are rare, so capping audits-per-tick
// at 1 (any further posted rows stay 'watching' and audit on the next hourly tick) keeps
// the cron well inside its budget. SAM refetches (the cheap part) are still capped at
// MAX_TICK_PER_RUN.
const MAX_AUDITS_PER_TICK = 1;
// Tighter than the 270s default so the ~270s engine PLUS the watcher's SAM-refetch +
// PDF-fetch/upload prologue fits under the route's 300s maxDuration (avoids a Vercel
// hard-kill that would strand rows mid-run).
const WATCHER_AGENTIC_BUDGET_MS = 200_000;
// A watcher audit that has sat in 'posted' (or its audit row in 'processing') longer
// than this was interrupted (hard-kill / crash). The tick's recovery sweep reclaims it
// — the watcher creates audits rows with NO pending_audits row, so the resident
// worker's reclaim never touches them; this is their only recovery path.
const STUCK_POSTED_MS = 12 * 60 * 1000;
// How long ago must last_checked_at be for the row to be eligible. Avoids
// hot-looping on a row that just failed (the cron tick is daily today but
// we keep the throttle so manual ticks can't hammer SAM).
const RECHECK_COOLDOWN_MS = 30 * 60 * 1000;

export interface WatcherTickOptions {
  dryRun?: boolean;
  maxRows?: number;
  appBaseUrl?: string; // for absolute URLs in the email
}

export interface WatcherTickResult {
  checked: number;
  posted: number;
  audited: number;
  skipped: number;
  errors: Array<{ watchedId: string; noticeId: string; message: string }>;
  dryRun: boolean;
}

type WatchedRow = {
  id: string;
  user_id: string;
  audit_id: string | null;
  notice_id: string;
  solicitation_number: string | null;
  title: string | null;
  agency: string | null;
  notice_type: string | null;
  response_deadline: string | null;
  status: "watching" | "posted" | "audited";
  notify_email: boolean;
  notify_in_app: boolean;
  last_checked_at: string | null;
  created_at: string;
};

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("watcher-tick: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchEmailForUser(admin: SupabaseClient, userId: string): Promise<string | null> {
  // auth.admin.getUserById returns { data: { user } }
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}

// Build the executeAudit input from a posted SAM solicitation. Assembles the FULL
// form-first document set (ingestion + attachments) like the main customer POST and the
// refetch route, then runs through executeAudit() (→ the agentic V3 engine), so a watcher
// audit is a REAL complete audit (not single-doc/forced-incomplete) and inherits the
// engine="agentic_v3" marker + honest-fail gate the customer path uses.
async function buildWatcherAuditInput(
  solicitation: Solicitation,
  agency: string | null,
  bidderProfile: ReturnType<typeof buildBidderProfileFromCapability>
): Promise<{ ok: true; input: AuditExecutionInput; pdfSource: PdfSource } | { ok: false; error: string }> {
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

  // Full form-first multi-attachment assembly — identical to the main customer POST and
  // the refetch route. The watcher decrements a real audit-quota unit, so the customer
  // gets a REAL complete audit; without the manifest the engine would force
  // documents_complete=false on every multi-attachment notice. Manifest failure / no
  // primary falls through to the single-doc path below (honest-fail stays the degrade).
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

  if (!pdfBase64 && !pdfFileId && !imageBase64 && !extractedText) {
    return { ok: false, error: pdfUnavailableReason ?? "fetch failed" };
  }

  if (pdfBase64) {
    const buf = Buffer.from(pdfBase64, "base64");
    if (buf.length > PDF_FILES_API_THRESHOLD_BYTES) {
      const uploaded = await uploadPdfToFilesApi(buf, `watcher-${solicitation.noticeId}.pdf`);
      pdfFileId = uploaded.fileId;
      pdfBase64 = null;
      pdfSource = "sam_pdf_via_files_api";
    }
  }

  return {
    ok: true,
    pdfSource,
    input: {
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
      ingestion,
      bidderProfile,
      agenticBudgetMs: WATCHER_AGENTIC_BUDGET_MS
    }
  };
}

// Recovery sweep — reclaim watcher audits interrupted by a hard-kill/crash. The watcher
// runs the agentic engine synchronously inside a 300s Vercel cron and creates audits rows
// with NO pending_audits row, so the resident worker's orphan-reclaim can't see them.
// Without this, a row stuck in 'posted' is never re-selected (the tick query filters
// status='watching') → permanently lost. For each stale 'posted' row we consult its
// linked audit: completed → flip to 'audited' (no re-spend); otherwise → fail the orphan
// audit and roll the watch back to 'watching' so the next tick retries.
async function reclaimStuckWatcherRows(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_POSTED_MS).toISOString();
  const { data: stuck } = await admin
    .from("watched_notices")
    .select("id, audit_id, posted_at")
    .eq("status", "posted")
    .lt("posted_at", cutoff)
    .limit(50);
  let reclaimed = 0;
  for (const w of (stuck ?? []) as Array<{ id: string; audit_id: string | null }>) {
    let auditStatus: string | null = null;
    if (w.audit_id) {
      const { data: a } = await admin.from("audits").select("status").eq("id", w.audit_id).maybeSingle();
      auditStatus = (a?.status as string | null) ?? null;
    }
    const nowIso = new Date().toISOString();
    if (auditStatus === "complete") {
      // The audit finished but the flip→audited was lost (M4) — complete it now.
      await admin.from("watched_notices").update({ status: "audited", audited_at: nowIso, updated_at: nowIso }).eq("id", w.id);
    } else {
      if (w.audit_id && auditStatus && auditStatus !== "failed") {
        await admin.from("audits").update({ status: "failed", error_message: "watcher audit interrupted (cron hard-kill) — reclaimed" }).eq("id", w.audit_id);
      }
      await admin.from("watched_notices").update({ status: "watching", posted_at: null, updated_at: nowIso }).eq("id", w.id);
    }
    reclaimed++;
  }
  return reclaimed;
}

export async function runWatcherTick(opts: WatcherTickOptions = {}): Promise<WatcherTickResult> {
  const dryRun = !!opts.dryRun;
  const maxRows = Math.max(1, Math.min(opts.maxRows ?? MAX_TICK_PER_RUN, MAX_TICK_PER_RUN));
  const appBase = (opts.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://faraudit.com").replace(/\/+$/, "");

  const admin = adminClient();
  const cooldownIso = new Date(Date.now() - RECHECK_COOLDOWN_MS).toISOString();

  // Eligible: status='watching' AND (last_checked_at IS NULL OR older than cooldown)
  const { data: rowsRaw, error: queryErr } = await admin
    .from("watched_notices")
    .select("id, user_id, audit_id, notice_id, solicitation_number, title, agency, notice_type, response_deadline, status, notify_email, notify_in_app, last_checked_at, created_at")
    .eq("status", "watching")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cooldownIso}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(maxRows);

  if (queryErr) throw new Error(`watcher-tick query failed: ${queryErr.message}`);
  const rows = (rowsRaw ?? []) as WatchedRow[];

  const result: WatcherTickResult = {
    checked: 0,
    posted: 0,
    audited: 0,
    skipped: 0,
    errors: [],
    dryRun
  };

  // Count ATTEMPTS, not successes — a single ~270s agentic run that times out and
  // throws must still block a second run this tick (two would blow the 300s cron
  // budget and get hard-killed mid-run, orphaning a 'processing' row).
  let auditsAttempted = 0;

  // Recover any rows stranded by a prior tick's hard-kill before doing new work.
  if (!dryRun) {
    try {
      const reclaimed = await reclaimStuckWatcherRows(admin);
      if (reclaimed) console.log(`[watcher-tick] reclaimed ${reclaimed} stuck row(s)`);
    } catch (err) {
      console.warn(`[watcher-tick] reclaim sweep failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const row of rows) {
    result.checked++;
    try {
      const solicitation = await fetchSolicitationByNoticeId(row.notice_id);
      const now = new Date().toISOString();
      // Always stamp last_checked_at — we just hit SAM.
      if (!solicitation || solicitation.resourceLinks.length === 0) {
        if (!dryRun) {
          await admin.from("watched_notices").update({ last_checked_at: now, updated_at: now }).eq("id", row.id);
        }
        result.skipped++;
        continue;
      }

      // Cap agentic audits per tick (each runs the full ~270s engine; the cron
      // budget is 300s). Any further posted rows stay 'watching' (we only stamp
      // last_checked_at) and audit on the next hourly tick — no row is lost.
      if (auditsAttempted >= MAX_AUDITS_PER_TICK) {
        if (!dryRun) {
          await admin.from("watched_notices").update({ last_checked_at: now, updated_at: now }).eq("id", row.id);
        }
        result.skipped++;
        continue;
      }

      // Transition []→[url] — run the full audit. Flip to 'posted' first
      // so a parallel tick on the same row no-ops (idempotency guard).
      if (!dryRun) {
        const { error: postedErr } = await admin
          .from("watched_notices")
          .update({ status: "posted", posted_at: now, last_checked_at: now, updated_at: now })
          .eq("id", row.id)
          .eq("status", "watching"); // CAS: only flip from watching
        if (postedErr) throw new Error(`watched flip→posted failed: ${postedErr.message}`);
      }
      result.posted++;

      if (dryRun) {
        result.skipped++; // counted as skipped because audit not run
        continue;
      }

      const refreshedAgency = resolveAgency(solicitation) || row.agency;
      const officeLeaf = resolveOfficeLeaf(solicitation); // FA-151

      // Roll the watched row back to 'watching' so the next tick retries — never
      // leave it stuck in 'posted' on a transient SAM/engine hiccup.
      const rollbackWatched = async () => {
        await admin.from("watched_notices")
          .update({ status: "watching", posted_at: null, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      };

      // The watcher owner's capability profile (open-world; socioeconomic certs only)
      // for the agentic eligibility lane — mirror the customer-initiated path so the
      // auto-audit reasons about the owner's certs. Best-effort → null (unknown firm).
      let bidderProfile = null;
      try {
        const { data: capRow } = await admin
          .from("capability_statements")
          .select("certifications")
          .eq("user_id", row.user_id)
          .maybeSingle();
        bidderProfile = buildBidderProfileFromCapability(capRow);
      } catch { /* unknown firm on any error — never block the audit */ }

      // Build the engine input (SAM PDF fetch/ingest).
      const built = await buildWatcherAuditInput(solicitation, refreshedAgency, bidderProfile);
      if (!built.ok) {
        result.errors.push({ watchedId: row.id, noticeId: row.notice_id, message: built.error });
        await rollbackWatched();
        continue;
      }

      // Pre-create the audits row (status='processing') so executeAudit can fill it —
      // exactly how the customer async/worker path works. executeAudit routes into the
      // agentic V3 engine (the hard default) and persists the verdict + engine marker +
      // honest_fail/documents_complete into THIS row. No more V1 runAudit here.
      const { data: createdRow, error: createErr } = await admin
        .from("audits")
        .insert({
          user_id: row.user_id,
          notice_id: row.notice_id,
          solicitation_number: solicitation.solicitationNumber ?? row.solicitation_number ?? null,
          title: solicitation.title ?? row.title ?? null,
          agency: refreshedAgency,
          office_leaf: officeLeaf,
          naics_code: solicitation.naicsCode ?? null,
          set_aside: solicitation.typeOfSetAside ?? null,
          posted_date: solicitation.postedDate ?? null,
          response_deadline: solicitation.responseDeadLine ?? row.response_deadline ?? null,
          audit_source: "watcher_auto",
          status: "processing" as const
        })
        .select("id")
        .single();
      if (createErr || !createdRow) {
        result.errors.push({ watchedId: row.id, noticeId: row.notice_id, message: `audit row create failed: ${createErr?.message ?? "no row"}` });
        await rollbackWatched();
        continue;
      }
      const newAuditId = createdRow.id as string;

      // Link the watch to its audit row NOW (status stays 'posted'), so the recovery
      // sweep can tell a completed-but-unflipped audit (→ flip to audited, no re-spend)
      // from a genuinely interrupted one (→ retry) if this tick is hard-killed below.
      await admin.from("watched_notices").update({ audit_id: newAuditId, updated_at: new Date().toISOString() }).eq("id", row.id);

      // Run the agentic engine — fills the row (verdict, compliance_json with
      // honest_fail/documents_complete, engine='agentic_v3', status='complete').
      // Count the attempt BEFORE the (possibly ~270s) call so a timeout still
      // caps this tick to one run.
      auditsAttempted++;
      try {
        await executeAudit(admin, newAuditId, built.input);
      } catch (err) {
        result.errors.push({ watchedId: row.id, noticeId: row.notice_id, message: `agentic audit failed: ${err instanceof Error ? err.message : String(err)}` });
        await admin.from("audits")
          .update({ status: "failed", error_message: err instanceof Error ? err.message.slice(0, 500) : "audit failed" })
          .eq("id", newAuditId);
        await rollbackWatched();
        continue;
      }

      // Re-read the persisted verdict for the notification + email (executeAudit
      // owns the row write; the watcher reads it back rather than re-deriving).
      const { data: persisted } = await admin
        .from("audits")
        .select("recommendation, compliance_score, compliance_json, risks_json")
        .eq("id", newAuditId)
        .single();
      const recommendation = (persisted?.recommendation as string | null) ?? null;
      const complianceScore = (persisted?.compliance_score as number | null) ?? null;
      const cjForEmail = (persisted?.compliance_json ?? {}) as Record<string, unknown>;
      // Defense-in-depth false-green guard, shared by the in-app notification AND the
      // email: an agentic honest-fail (INCOMPLETE / NEEDS_HUMAN_REVIEW) or an unconfirmed
      // document set must NOT be presented as a clean "complete · verdict" on EITHER
      // surface — independent of recommendation.
      const incomplete = cjForEmail.honest_fail === true || cjForEmail.documents_complete === false;

      // Flip watched_notices → audited (audit_id already linked above). Check the
      // error: the audit is complete + paid, so a lost flip would leave the row in
      // 'posted' AND let the recovery sweep see status='complete' and re-flip it next
      // tick — but we surface it loudly here regardless of that backstop.
      const auditedAt = new Date().toISOString();
      const { error: auditedFlipErr } = await admin.from("watched_notices")
        .update({
          status: "audited",
          audited_at: auditedAt,
          audit_id: newAuditId,
          updated_at: auditedAt
        })
        .eq("id", row.id);
      if (auditedFlipErr) {
        // Audit is done/paid; the sweep will reconcile (sees audit status='complete').
        result.errors.push({ watchedId: row.id, noticeId: row.notice_id, message: `watched flip→audited failed (audit complete, sweep will reconcile): ${auditedFlipErr.message}` });
      }
      result.audited++;

      // Notification (in-app)
      if (row.notify_in_app) {
        await admin.from("notifications").insert({
          user_id: row.user_id,
          kind: "watcher_posted",
          title: `${row.title || "Your tracked notice"} just posted`,
          body: incomplete
            ? "Auto-audit needs your review — couldn't confirm a complete read"
            : `Auto-audit complete · ${String(recommendation ?? "").replace(/_/g, " ").toUpperCase() || "verdict ready"}`,
          link: `/audit/${newAuditId}`,
          meta: {
            audit_id: newAuditId,
            notice_id: row.notice_id,
            watched_id: row.id,
            score: complianceScore,
            recommendation,
            incomplete
          }
        });
      }

      // Email
      if (row.notify_email) {
        const toEmail = await fetchEmailForUser(admin, row.user_id);
        if (toEmail) {
          // V3 surfaces detail in the grounded report (not a flat flags list); the
          // show-stopper count carries the "how many bars" signal for the email.
          const complianceFlagsCount = 0;
          const rj = (persisted?.risks_json ?? {}) as { show_stoppers?: number };
          const risksFlagsCount = typeof rj.show_stoppers === "number" ? rj.show_stoppers : 0;
          const out = await sendWatcherPostedEmail({
            toEmail,
            title: solicitation.title ?? row.title ?? "Your tracked notice",
            solicitationNumber: solicitation.solicitationNumber ?? row.solicitation_number,
            agency: refreshedAgency,
            naics: solicitation.naicsCode,
            priorNoticeType: row.notice_type,
            noticeType: solicitation.type,
            score: complianceScore,
            recommendation,
            incomplete,
            complianceFlagsCount,
            risksFlagsCount,
            responseDeadline: solicitation.responseDeadLine,
            questionsDueDate: null,
            auditUrl: `${appBase}/audit/${newAuditId}`,
            watchingUrl: `${appBase}/watching`,
            settingsUrl: `${appBase}/settings`,
            unsubscribeUrl: `${appBase}/settings#alerts`,
            postedAt: solicitation.postedDate ?? new Date().toISOString(),
            pdfSource: built.pdfSource
          });
          if (!out.ok) {
            // Surface but don't fail the audit — the audit row + bell + UI are
            // already wired; email is best-effort.
            console.warn(`[watcher-tick] email send failed for user ${row.user_id}: ${out.error}`);
          }
        }
      }
    } catch (err) {
      result.errors.push({
        watchedId: row.id,
        noticeId: row.notice_id,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return result;
}
