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
import { uploadPdfToFilesApi } from "@/lib/anthropic-files";
import { MAX_PDF_BYTES } from "@/lib/validators";
import { runAudit, type PdfSource } from "@/lib/audit-engine";
import { sendWatcherPostedEmail } from "@/lib/email/watcher-posted";

const PDF_FILES_API_THRESHOLD_BYTES = 20_000_000;
const MAX_TICK_PER_RUN = 25;
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

async function runOneAudit(solicitation: Solicitation, noticeId: string): Promise<{ ok: true; result: Awaited<ReturnType<typeof runAudit>>; pdfSource: PdfSource } | { ok: false; error: string }> {
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

  if (!pdfBase64 && !pdfFileId && !imageBase64 && !extractedText) {
    return { ok: false, error: pdfUnavailableReason ?? "fetch failed" };
  }

  if (pdfBase64) {
    const buf = Buffer.from(pdfBase64, "base64");
    if (buf.length > PDF_FILES_API_THRESHOLD_BYTES) {
      const uploaded = await uploadPdfToFilesApi(buf, `watcher-${noticeId}.pdf`);
      pdfFileId = uploaded.fileId;
      pdfBase64 = null;
      pdfSource = "sam_pdf_via_files_api";
    }
  }

  try {
    const result = await runAudit({
      solicitation,
      pdfBase64,
      pdfFileId,
      imageBase64,
      imageMediaType,
      extractedText,
      extractedFormat,
      pdfSource,
      pdfUnavailableReason
    });
    return { ok: true, result, pdfSource };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "audit failed" };
  }
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

      // Run audit
      const audited = await runOneAudit(solicitation, row.notice_id);
      if (!audited.ok) {
        result.errors.push({ watchedId: row.id, noticeId: row.notice_id, message: audited.error });
        // Roll status back to 'watching' so the next tick retries (don't
        // leave the row stuck in 'posted' forever on a transient SAM PDF
        // hiccup). last_checked_at stays — cooldown still applies.
        await admin.from("watched_notices")
          .update({ status: "watching", posted_at: null, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        continue;
      }

      const audit = audited.result;
      const persistedComplianceJson = {
        ...audit.compliance.json,
        score_confidence: audit.score_confidence ?? null,
        is_not_solicitation: audit.is_not_solicitation ?? false,
        notice_type: solicitation.type ?? row.notice_type ?? null,
        pdf_source: audited.pdfSource,
        watcher_auto_audited: true,
        watcher_audited_at: new Date().toISOString()
      };
      const refreshedAgency = resolveAgency(solicitation) || row.agency;
      const officeLeaf = resolveOfficeLeaf(solicitation); // FA-151

      const insertRow = {
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
        document_type: audit.classification.document_type,
        document_type_rationale: audit.classification.rationale,
        document_type_confidence: audit.classification.confidence,
        overview_summary: audit.overview.summary,
        overview_json: audit.overview.json,
        compliance_summary: audit.compliance.summary,
        compliance_json: persistedComplianceJson,
        risks_summary: audit.risks.summary,
        risks_json: audit.risks.json,
        compliance_score: audit.compliance_score,
        recommendation: audit.recommendation,
        bid_recommendation: audit.bid_recommendation,
        status: "complete" as const,
        audit_source: "watcher_auto",
        completed_at: new Date().toISOString()
      };

      const { data: insertedRows, error: insertErr } = await admin
        .from("audits")
        .insert(insertRow)
        .select("id")
        .single();
      if (insertErr || !insertedRows) {
        result.errors.push({ watchedId: row.id, noticeId: row.notice_id, message: `audit insert failed: ${insertErr?.message ?? "no row"}` });
        await admin.from("watched_notices")
          .update({ status: "watching", posted_at: null, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        continue;
      }
      const newAuditId = insertedRows.id as string;

      // Flip watched_notices → audited, back-fill audit_id
      const auditedAt = new Date().toISOString();
      await admin.from("watched_notices")
        .update({
          status: "audited",
          audited_at: auditedAt,
          audit_id: newAuditId,
          updated_at: auditedAt
        })
        .eq("id", row.id);
      result.audited++;

      // Notification (in-app)
      if (row.notify_in_app) {
        await admin.from("notifications").insert({
          user_id: row.user_id,
          kind: "watcher_posted",
          title: `${row.title || "Your tracked notice"} just posted`,
          body: `Auto-audit complete · score ${audit.compliance_score ?? "—"} · ${String(audit.recommendation ?? "").toUpperCase() || "verdict ready"}`,
          link: `/audit/${newAuditId}`,
          meta: {
            audit_id: newAuditId,
            notice_id: row.notice_id,
            watched_id: row.id,
            score: audit.compliance_score ?? null,
            recommendation: audit.recommendation ?? null
          }
        });
      }

      // Email
      if (row.notify_email) {
        const toEmail = await fetchEmailForUser(admin, row.user_id);
        if (toEmail) {
          const complianceFlagsCount = Array.isArray((audit.compliance.json as { flags?: unknown[] })?.flags)
            ? ((audit.compliance.json as { flags: unknown[] }).flags.length)
            : 0;
          const risksFlagsCount = Array.isArray((audit.risks.json as { items?: unknown[] })?.items)
            ? ((audit.risks.json as { items: unknown[] }).items.length)
            : 0;
          const out = await sendWatcherPostedEmail({
            toEmail,
            title: solicitation.title ?? row.title ?? "Your tracked notice",
            solicitationNumber: solicitation.solicitationNumber ?? row.solicitation_number,
            agency: refreshedAgency,
            naics: solicitation.naicsCode,
            priorNoticeType: row.notice_type,
            noticeType: solicitation.type,
            score: audit.compliance_score,
            recommendation: audit.recommendation ?? null,
            complianceFlagsCount,
            risksFlagsCount,
            responseDeadline: solicitation.responseDeadLine,
            questionsDueDate: null,
            auditUrl: `${appBase}/audit/${newAuditId}`,
            watchingUrl: `${appBase}/watching`,
            settingsUrl: `${appBase}/settings`,
            unsubscribeUrl: `${appBase}/settings#alerts`,
            postedAt: solicitation.postedDate ?? new Date().toISOString(),
            pdfSource: audited.pdfSource
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
