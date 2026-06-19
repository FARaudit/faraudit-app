// Customer-facing display helpers for audit rows.
//
// The customer-visible UUID leak (e.g. "pdf-1778020342046",
// "aefdb844d9b044c5aac29cbd28bbf038") comes from rendering audits.notice_id
// directly in headers, subtitles, KO email subjects, PDF footers, etc.
// The DB has the canonical solicitation number on audits.solicitation_number
// when SAM returned one; for PDF-only uploads the route synthesizer derives
// audits.title from the filename ("FA301626Q0068") which is also canonical.
// This helper picks the best display ID with a stable priority chain.

const PDF_UPLOAD_RE = /^pdf-\d+$/;
const HEX_32_RE = /^[a-f0-9]{32}$/i;
// SAM.gov occasionally leaks a PSC code + product description into the
// solicitationNumber field for sources-sought / RFI notices (e.g.
// "3990--COMPACT TRACK LOADER, FULLY ENCLOSED CAB, 12-15K LB CLASS").
// Sanitizers in src/lib/sam.ts + agents/sam-ingest/helpers.ts strip these at
// ingest time, but rows persisted before those sanitizers shipped still
// carry the leak. Treat any whitespace-containing or "--"-containing string
// as a synthetic-shaped leak so existing dirty data renders cleanly via
// fallback to notice_id / title.
const PSC_LEAK_RE = /^\d{4}--|^\s*\S+\s+\S/;
// Titles like "Stranded notice 7e13f96a69c04c10ba8a0fd004e9ac1b" were
// written by the disposable verify-p0a.ts harness during P0-A verification.
// They contain a hex hash inside an otherwise human-looking string so the
// HEX_32_RE whole-string guard misses them. Treat as synthetic.
const STRANDED_TITLE_RE = /^stranded notice [a-f0-9]{32}$/i;

interface AuditLike {
  solicitation_number?: string | null;
  notice_id?: string | null;
  title?: string | null;
}

// FA-186 — strip filename artifacts from an uploaded-audit title: a leading
// enumeration prefix ("2. ") and a trailing "- Solicitation / RFP / RFQ / IFB /
// RFI" boilerplate tail. Caller scopes this to upload rows so SAM-sourced titles
// (which legitimately contain these words) are untouched.
export function cleanUploadedTitle(t: string): string {
  return t
    .replace(/^\s*\d{1,3}\.\s+/, "")
    .replace(/\s*[-–—]\s*(?:solicitation|sol|rfp|rfq|ifb|rfi)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function displaySolicitationId(a: AuditLike): string {
  const sn = a.solicitation_number?.trim();
  if (sn && !PSC_LEAK_RE.test(sn) && sn.length <= 25) return sn;
  const nid = a.notice_id?.trim() ?? "";
  if (nid && !PDF_UPLOAD_RE.test(nid) && !HEX_32_RE.test(nid)) return nid;
  // For PDF-upload audits the route's synthesizer (api/audit/route.ts:131-153)
  // sets title from the cleaned filename — usually the canonical solicitation
  // number ("FA301626Q0068"). Use it when it doesn't itself look synthetic.
  const t = a.title?.trim();
  if (t && !PDF_UPLOAD_RE.test(t) && !HEX_32_RE.test(t) && !STRANDED_TITLE_RE.test(t) && !/^Untitled/i.test(t)) return t;
  // Last-line: never leak the synthetic ID. "—" is a clean visual fallback.
  return "—";
}

// Card-friendly display name for audit rows in lists (Pipeline kanban, Recent
// Audits, Past Audits, Capability past-perf, etc.). Different responsibility
// from displaySolicitationId — that returns an ID-shaped string for subtitles;
// this returns a sentence-friendly title.
//
// Priority: clean title > solicitation_number > clean notice_id > humanized
// "Untitled audit · {timestamp}" fallback. The timestamp uses the browser's
// local time zone via toLocaleString without an explicit timeZone option.
export function auditDisplayName(
  a: AuditLike & { created_at?: string | null }
): string {
  const t = a.title?.trim();
  if (t && !PDF_UPLOAD_RE.test(t) && !HEX_32_RE.test(t) && !STRANDED_TITLE_RE.test(t) && !/^Untitled/i.test(t)) {
    // FA-186 — uploaded-audit titles are derived from the primary filename,
    // which can carry an enumeration prefix and a "- Solicitation" boilerplate
    // suffix ("2. AOCSSB26R0039 - Solicitation"). Strip them; when the result
    // collapses to the solicitation number, prefer the clean DB column. Scoped
    // to uploads (notice_id "pdf-<n>") so SAM-sourced titles are never touched.
    if (PDF_UPLOAD_RE.test((a.notice_id ?? "").trim())) {
      const cleaned = cleanUploadedTitle(t);
      const snUp = a.solicitation_number?.trim();
      if (snUp && (cleaned === "" || cleaned.toUpperCase() === snUp.toUpperCase())) return snUp;
      if (cleaned) return cleaned;
    }
    return t;
  }
  const sn = a.solicitation_number?.trim();
  if (sn && !PSC_LEAK_RE.test(sn) && sn.length <= 25) return sn;
  const nid = a.notice_id?.trim();
  if (nid && !PDF_UPLOAD_RE.test(nid) && !HEX_32_RE.test(nid)) return nid;
  if (a.created_at) {
    const d = new Date(a.created_at);
    if (!Number.isNaN(d.getTime())) {
      return `Untitled audit · ${d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })}`;
    }
  }
  return "Untitled audit";
}

// URL builder for audit detail links. Prefers solicitation_number (slug form)
// over the UUID id so external paste-shares look like /audit/fa301626q0068
// instead of /audit/{uuid}. Lowercases for URL hygiene; the /audit/[id] route
// matches case-insensitive so any cased paste still resolves.
//
// Leaky sol#s (PSC-prefix dumps, anything with whitespace, anything >25
// chars) fall back to UUID — a clean URL beats a slug we'd have to URL-encode.
export function auditHref(a: { id: string; solicitation_number?: string | null }): string {
  const sn = a.solicitation_number?.trim();
  if (sn && !PSC_LEAK_RE.test(sn) && sn.length <= 25) {
    return `/audit/${sn.toLowerCase()}`;
  }
  return `/audit/${a.id}`;
}

// ── V2 "finalizing" window (FA-E2E re-verify Fix D, 2026-06-18) ──────────────
// The executor marks an audit complete as soon as the core (V1) report is ready,
// then runs the V2 agentic layer for ~2-3 min and merges it into
// compliance_json.v2_shadow (flipping analysis_phase → "done"). Shared so the
// page route, the PDF proxy, and the export-disable logic all agree on the same
// finalizing window. Factored out of src/app/audit/[id]/route.ts.
export const V2_FINALIZING_MAX_MS = 6 * 60 * 1000; // backstop: stop waiting if V2 stalls

export function isV2Finalizing(audit: Record<string, unknown>): boolean {
  const comp = (audit.compliance_json ?? {}) as Record<string, unknown>;
  // Doctrine: the export gate is OPEN (this returns false) only when the V2
  // agentic layer has fully landed — i.e. v2_shadow is present. Any other state
  // where the deep layer is missing keeps the gate CLOSED so we never ship a
  // half/degraded report (no agency / work-statement / capture-play).
  if (comp.v2_shadow) return false; // agentic layer already landed → full report
  // FIX 5: V2 errored/timed-out (no v2_shadow) → degraded; keep export gated, never ship a half report.
  // The executor writes analysis_phase:"done" + v2_error on an errored finish, so
  // the phase==="finalizing" check below would otherwise fall through and open the
  // gate on a shadow-less degraded report. Treat a shadow-less error as still-gated.
  if (comp.v2_error) return true;
  if (comp.analysis_phase !== "finalizing") return false; // arm with no V2 to wait for
  const completedRaw = audit.completed_at ? String(audit.completed_at) : "";
  const completedMs = completedRaw ? Date.parse(completedRaw) : NaN;
  if (!Number.isFinite(completedMs)) return false;
  return Date.now() - completedMs < V2_FINALIZING_MAX_MS; // within the live window
}

// FIX 5 companion — TERMINAL degraded state: the V2 agentic layer errored/timed
// out (v2_error written, NO v2_shadow). isV2Finalizing() returns true for this
// (export must stay gated), but the page must NOT treat it like a LIVE finalizing
// run — there is nothing left to stream in, so the auto-refresh + spinner would
// loop forever. Callers use this to keep export disabled while showing the
// (degraded) report as-is, with no infinite refresh.
export function isV2Degraded(audit: Record<string, unknown>): boolean {
  const comp = (audit.compliance_json ?? {}) as Record<string, unknown>;
  return !comp.v2_shadow && Boolean(comp.v2_error);
}
