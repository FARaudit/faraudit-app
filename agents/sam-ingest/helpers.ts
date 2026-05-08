// Shared SAM → pending_audits field-mapping helpers. Both the daily ingest
// (index.ts) and the one-shot backfill (backfill-fields.ts) import from here so
// the precedence rules are defined exactly once.

import type { SamOpportunity } from "./sam-client.ts";

// SAM.gov occasionally puts a PSC code + product name into the
// solicitationNumber field on sources-sought / RFI / special notices that
// don't have a real sol#. Visible symptom in production: row #1 of the
// Defense Spending / SAM Opportunities table showed "3990--COMPACT TRACK
// LOADER, FULLY ENCLOSED CAB, 12-15K LB CLASS" as the Sol. Number — that's
// PSC 3990 (Misc Material Handling Equipment) + the upper-cased item title,
// not an actual contract identifier.
//
// Real solicitation numbers are alphanumeric tokens ≤25 chars with no
// spaces and no "--" sentinel. PSC-shaped leaks always start with 4 digits
// followed by "--". This sanitizer returns null for anything that doesn't
// look like a real sol#, so the UI falls through to notice_id / title via
// displaySolicitationId() instead of leaking the PSC token.
export function sanitizeSolicitationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  // PSC-prefix leak ("3990--COMPACT TRACK LOADER…")
  if (/^\d{4}--/.test(t)) return null;
  // Anything that contains a "--" with surrounding non-token whitespace is
  // descriptive text, not a sol#.
  if (t.includes("--") && /\s/.test(t)) return null;
  // Sol#s have no internal whitespace and are bounded length. Real ones we've
  // seen: FA301626Q0068, W912DY24R0042, N0040626Q0045 — all ≤16 chars.
  if (/\s/.test(t)) return null;
  if (t.length > 25) return null;
  return t;
}

// Agency resolution. SAM v2 search payloads no longer return department or
// subTier as standalone fields (probed 2026-05-07) — agency now arrives only
// as fullParentPathName, a dotted hierarchy like
// "INTERIOR, DEPARTMENT OF THE.NATIONAL PARK SERVICE.MWR MIDWEST REGION(60000)".
//
// Behavior:
//   1. Pick fullParentPathName first; fall back to department / subTier for
//      legacy responses or other endpoints that still emit them.
//   2. If the value is dotted, take the first two segments (department · service).
//      Single-segment values pass through unchanged.
//   3. Strip trailing parenthetical org codes from each kept segment
//      (e.g. "MWR MIDWEST REGION(60000)" → "MWR MIDWEST REGION").
//   4. Join with " · " (Unicode middle dot, surrounded by single spaces) —
//      same separator the UI uses elsewhere.
//   5. No title-casing — SAM caps stay; queued as P3 polish.
//
// Returns null only when SAM truly has nothing.
export function resolveAgency(o: SamOpportunity & { fullParentPathName?: string | null }): string | null {
  const raw =
    (o as { fullParentPathName?: string | null }).fullParentPathName ||
    o.department ||
    o.subTier ||
    null;
  if (!raw) return null;

  const stripParens = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const segments = raw.includes(".") ? raw.split(".").slice(0, 2) : [raw];
  const cleaned = segments.map(stripParens).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" · ") : null;
}

// Risk classifier — deterministic v0. Runs at ingest time on the SAM payload.
// Persisted into pending_audits.risk_level (migration 020). The UI combines
// this static verdict with response_deadline at render time to escalate
// ≤7d / ≤3d rows in real time (so a row that was P2 at ingest correctly
// becomes P0 as its deadline approaches without a re-classify pass).
//
// Rule precedence: P0 > P1 > P2 > Watch. First-match wins within each tier.
// All description matching uses the 4KB excerpt SAM returns — sufficient for
// keyword regex hits even though full SOWs are longer.
//
// Returns one of: "P0" | "P1" | "P2" | "Watch".
export type RiskLevel = "P0" | "P1" | "P2" | "Watch";

// Substantive-keyword matching only — bare DFARS clause numbers (252.223-7008,
// 252.204-7021, 252.225-7060) are MANDATORY flow-down clauses that DoD
// prescribes on essentially every supply solicitation per Acquisition.gov.
// Citing the number doesn't mean the clause's substantive trap applies. We
// match on the trap's actual subject matter instead, which is the signal
// that distinguishes a real deal-breaker from boilerplate.
const HEX_CHROME_RE = /hexavalent\s+chromium|hex.chrome/i;
const XINJIANG_RE = /xinjiang|uyghur/i;
const CMMC_RE = /CMMC.{0,40}level\s*[23]/i;
const SOLE_SOURCE_RE = /sole.source|intent to (sole.|)?award without (full and open )?competition/i;
const SRC_SOUGHT_TITLE_RE = /\b(special notice|RFI|sources sought)\b/i;
// "Combined Synopsis/Solicitation" is SAM's default notice type for
// commercial-item acquisitions under FAR Parts 12/13 — fires on virtually
// every small-biz RFQ. Not a complexity signal; excluded. IDIQ / BPA /
// TaskOrd are real contract-structure complexity that demand more proposal
// effort.
const COMPLEX_DOC_TYPES = new Set(["IDIQ", "BPA", "TaskOrd"]);

export function classifyRisk(
  o: SamOpportunity & { fullParentPathName?: string | null },
  now: Date = new Date()
): RiskLevel {
  const desc = o.description || "";
  const title = o.title || "";

  // ─── P0 (deal-breaker) ─────────────────────────────────────────────────
  // Deadline window — proximate-impact: a closing-tomorrow opportunity is
  // P0 regardless of what's in the SOW. Lower-bounded at 0 so expired
  // deadlines (negative daysOut) fall through to other rules. Without this
  // bound the corpus floods P0 with dead notices the cron never archived.
  if (o.responseDeadLine) {
    const deadline = Date.parse(o.responseDeadLine);
    if (!Number.isNaN(deadline)) {
      const daysOut = (deadline - now.getTime()) / 86400000;
      if (daysOut >= 0 && daysOut <= 3) return "P0";
    }
  }
  // DFARS trap clauses cited in description excerpt. These disqualify a
  // non-compliant bidder regardless of set-aside type.
  if (HEX_CHROME_RE.test(desc)) return "P0";
  if (XINJIANG_RE.test(desc)) return "P0";
  if (CMMC_RE.test(desc)) return "P0";

  // ─── P1 (major risk) ───────────────────────────────────────────────────
  // Same lower bound as P0 — expired deadlines don't trip P1 either.
  if (o.responseDeadLine) {
    const deadline = Date.parse(o.responseDeadLine);
    if (!Number.isNaN(deadline)) {
      const daysOut = (deadline - now.getTime()) / 86400000;
      if (daysOut >= 0 && daysOut <= 7) return "P1";
    }
  }
  // Proposal-effort proxy: complex contract structures eat capture-team time.
  // classifyDocType() is the source of truth for these buckets.
  const docType = classifyDocType(o.type);
  if (COMPLEX_DOC_TYPES.has(docType)) return "P1";

  // ─── P2 (notable) ──────────────────────────────────────────────────────
  if (SOLE_SOURCE_RE.test(desc)) return "P2";
  if (docType === "SrcSght" && SRC_SOUGHT_TITLE_RE.test(title)) return "P2";

  return "Watch";
}

// Document-type classifier. Previously returned null for everything except
// IDIQ / BPA / Task Order / Modification — which dropped 90%+ of the daily
// feed (plain "Solicitation" / "Combined Synopsis/Solicitation" entries) into
// blank cells. Now falls back to a normalized short-form bucket so the Type
// column is always populated.
//
// Priority: contract-structure markers first (IDIQ / BPA / Task Order / Mod
// are more specific than the generic SAM "type" string and may co-occur with
// it). Then SAM canonical type strings normalized per spec. Final fallback:
// title-case the first word of the input (e.g. "RFI" → "Rfi", "Bid Notice"
// → "Bid"); empty / null inputs return "Other".
export function classifyDocType(t: string | null): string {
  const raw = (t || "").trim();
  const s = raw.toLowerCase();
  if (s.includes("idiq")) return "IDIQ";
  if (s.includes("bpa")) return "BPA";
  if (s.includes("task order")) return "TaskOrd";
  if (s.includes("modification")) return "Mod";
  if (s.includes("sources sought")) return "SrcSght";
  if (s.includes("presolicitation") || s.includes("pre-sol") || s.includes("pre sol")) return "PreSol";
  if (s.includes("combined")) return "Combined";
  if (s.includes("award")) return "Award";
  if (s.includes("solicitation")) return "RFQ"; // most common defense small-biz type
  if (!raw) return "Other";
  const first = raw.split(/[\s/,]+/)[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
