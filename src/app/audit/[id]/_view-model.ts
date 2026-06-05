// View model for the audit-report page.
//
// Maps a raw `audits` Supabase row + its sibling JSONB columns into the shape
// the design template's data-field attributes expect. Fields the design needs
// that the current schema doesn't carry (score_factors, win_themes, qa_deadline,
// award_date) are derived from neighbors or filled with sensible defaults so
// the 1:1 visual port renders without demo strings or blank sections.

import { displaySolicitationId, auditDisplayName } from "@/lib/audit-display";

type AuditRow = Record<string, unknown>;

export interface ComplianceFlag {
  clause: string;
  title: string;
  severity: "P0" | "P1" | "P2";
  description: string;
  required_action: string;
}

export interface Risk {
  title: string;
  severity: "high" | "med" | "low";
  citation: string;
  description: string;
  faraudit_action: string;
  // "verified" = the underlying risk text carried a FAR/DFARS citation.
  // "inferred" = pattern-derived (engine prefixed with [Inferred…] OR no
  // clause anchor). Renderer prefixes the risk title with a small badge so
  // customers can tell a clause-grounded finding from a pattern guess.
  // Default for legacy audit rows that pre-date the engine flag: "inferred".
  provenance: "verified" | "inferred";
}

export interface ScoreFactor {
  name: string;
  weight: number; // 0-100 (percent of total)
  score: number;  // 0-100
  note: string;
  tone: "good" | "ok" | "warn";
  drag?: boolean;
}

// §M Evaluation Factor — mirrors audit-engine EvaluationFactor. Sourced
// from compliance_json.evaluation_factors (which the engine hoists from
// Call 1 / Overview into Call 2 / Compliance for renderer convenience).
// tone drives the .sf-cov + .sf-bar i CSS classes (good|warn|bad|mute).
// coverage_pct is the bar width; 0 for Price (tone=mute, coverage=Tradeoff)
// and for any factor lacking a capability-profile score (coverage="—").
export interface EvaluationFactorVM {
  rank: number;
  name: string;
  importance: string;
  coverage: string;
  coverage_pct: number;
  tone: "good" | "warn" | "bad" | "mute";
  note: string;
}

// §L Submission Requirement — mirrors audit-engine SubmissionRequirement.
// status drives the .ready-dot class (ok→done, warn→warn, todo→todo per
// design CSS taxonomy) and the .ready-meta class + text ("Clear" /
// "At risk" / "Action").
export interface SubmissionRequirementVM {
  requirement: string;
  status: "ok" | "warn" | "todo";
  meta: "Clear" | "At risk" | "Action";
}

export interface ClinLineItem {
  clin: string;
  description: string;
  type: string;
  qty: string;
  has_flag: boolean;
  flag_label?: string;
}

export interface HierarchyNode {
  text: string;
  leaf: boolean;
}

export interface AuditViewModel {
  // identity
  solicitation_number: string;
  audit_id_short: string;
  audit_id_full: string;
  generated_at: string;
  page_title: string;

  // header
  title: string;
  agency: string;
  agency_sub: string;
  naics: string;
  naics_sub: string;
  set_aside: string;
  set_aside_sub: string;
  contract_type: string;
  contract_type_sub: string;

  // verdict block
  recommendation: "GO" | "CAUTION" | "DECLINE";
  recommendation_class: "v-go" | "v-caution" | "v-decline";
  recommendation_tagline: string;
  recommendation_pill_text: string;
  score: number | null;             // null when retrieval failed (sam_unavailable)
  score_display: string;            // "—" when null, else String(score)
  is_unscored: boolean;             // true when score is null or score_confidence === "unscored"
  win_probability: number | null;   // null when basis is 0 / unknown
  win_probability_benchmark: string;
  // Score-relative benchmark phrase ("Top quartile" / "Above average" /
  // "Mid-pack"). null on scores <60 — renderer strips the entire .mhv-bench
  // element so the masthead never shows the design's static demo text on a
  // genuinely-low audit. Sourced from compliance_json.score_benchmark which
  // the engine computes from the actual score.
  score_benchmark: string | null;

  // True when the audit ran against a non-solicitation (Award Notice /
  // attachment / unknown) OR a real source returned zero FAR/DFARS clauses.
  // Renderer suppresses the verdict block + shows a warning banner instead.
  is_not_solicitation: boolean;

  // key dates (qa_deadline + award_date are intentionally not derived; the
  // renderer drops the ribbon item + rail clock when has_* is false)
  qa_deadline: string;
  qa_days: string;
  qa_days_num: string;
  response_deadline: string;
  response_days: string;
  // Integer-only countdown for the prelim verdict tile (e.g. "28"). Distinct
  // from response_days ("in 28 days") which drives the keydates ribbon.
  response_days_num: string;
  // Short-form date prefixed with "due " (e.g. "due 6 Jul") for the prelim
  // tile's .mhv-note line. Empty when response_deadline is null.
  response_deadline_short: string;
  award_date: string;
  has_response_deadline: boolean;
  has_qa_deadline: boolean;
  has_award_date: boolean;

  // Preliminary-read verdict block (metadata-only state) — Design ruling
  // 2026-06-04: when no document was retrieved, surface SAM-metadata tiles
  // instead of a fabricated fit score.
  prelim_has_deadline: boolean;     // false → renderer omits Tile A entirely
  set_aside_eligibility: string;    // empty → renderer hides the .mhv-note line
  // Classifier output (PRELIMINARY-READ ADAPTIVE MODES, HANDOFF Jun 4):
  //   "fetch"  → doc exists on SAM but our retrieval failed (re-fetchable)
  //   "watch"  → pre-solicitation / sources-sought (no doc posted yet)
  //   "upload" → true manual fallback / unknown
  // Renderer maps "watch" → "upload" until the watcher surface ships;
  // prelim_mode stays as the raw classifier output for analytics + future
  // un-mapping (rendered_prelim_mode is what drives data-prelim-mode).
  prelim_mode: "fetch" | "watch" | "upload";
  rendered_prelim_mode: "fetch" | "watch" | "upload";

  // classification
  document_type: string;
  document_type_full: string;
  document_type_confidence: number; // 0-100
  document_type_confidence_label: string;
  document_type_reasoning: string;

  // incumbent
  incumbent: {
    has_data: boolean;          // false → hide entire §02
    has_expiry: boolean;        // false → hide .inc-expiry block within §02
    show_status_pill: boolean;  // false → hide section pill ("Recompete window open")
    status_label: string;
    name: string;
    initial: string;
    uei: string;
    award_value: string;
    expiry: string;
    days_to_expiry: number;
    last_lookup: string;
    track_width_pct: number; // for .inc-track i width
    expiry_note: string;     // derived caption (replaces hardcoded "<4 months" narrative)
    days_color_override: string | null; // null = default amber; non-null overrides for long-horizon
  };

  // scope/CLIN
  clin_summary: string;
  primary_objective: string;
  period_of_performance: string;
  customer_office: string;
  customer_hierarchy: HierarchyNode[];
  contract_type_detail: string;
  clin_line_items: ClinLineItem[];

  // compliance + risks
  compliance_flags: ComplianceFlag[];
  compliance_pill_text: string;     // "1 P0 · 2 P1 · 1 P2" derived from real counts
  risks: Risk[];
  risk_pill_text: string;           // "4 open" derived from real count
  headline_risk: Risk;
  show_moment_band: boolean;        // false when risks.length === 0 → hide whole band
  score_factors: ScoreFactor[];

  // §M Evaluation Factors + §L Submission Compliance (sec-eval).
  // Sourced from compliance_json.{eval_basis, eval_basis_label,
  // evaluation_factors, submission_requirements, submission_summary} —
  // emitted by Call 1 (Overview) per CEO spec and hoisted into compliance
  // by runAudit. False-precision gate: when evaluation_factors is empty,
  // the renderer strips the section + jump-nav entry entirely.
  eval_basis: string | null;
  eval_basis_label: string | null;
  evaluation_factors: EvaluationFactorVM[];
  submission_requirements: SubmissionRequirementVM[];
  submission_summary: string | null;

  // recommendation
  recommendation_rationale: string;
  recommendation_win_themes: string[];

  // ko email
  ko_email_to: string;
  ko_email_body: string;

  // misc
  is_metadata_only: boolean;
  is_watching: boolean;
  pdf_export_url: string;
  conf_ring_pct: number;
}

// ─── date helpers ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDayMonYear(d: Date | null): string {
  if (!d) return "—";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtMonYear(d: Date | null): string {
  if (!d) return "—";
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Short form for the prelim verdict tile, e.g. "due 6 Jul".
// Returns "" when date is null so the renderer omits the .mhv-note line.
function fmtDueShort(d: Date | null): string {
  if (!d) return "";
  return `due ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

// ─── display sanitizers ─────────────────────────────────────────────────────

// Audit-AI sometimes appends raw ISO timestamps to its "missing" fallback
// strings, e.g. period_of_performance:
//   "Not specified in available metadata; response deadline is 2026-06-18T15:00:00-05:00"
// Raw timestamps surfaced verbatim in the UI read as junk. Strip the
// engine's specific noise pattern + reformat any remaining ISO tokens to
// human form. Idempotent on already-clean text.
const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;

function sanitizeDisplayText(s: unknown): string {
  if (s == null) return "";
  let out = String(s);
  // Engine-emitted noise: "; response deadline is <ISO>" — strip the whole
  // phrase so the user sees just the empty-state copy.
  out = out.replace(
    /\s*[;,]?\s*response deadline is\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\.?/gi,
    ""
  );
  // Any remaining bare ISO → "D Mon YYYY" form.
  out = out.replace(ISO_RE, (m) => {
    const d = new Date(m);
    if (Number.isNaN(d.getTime())) return m;
    return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  });
  // Clean up doubled spaces / dangling punctuation left by the strip.
  out = out.replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").trim();
  return out;
}

// Set-aside normalization. SAM frequently emits "NONE" (or null) for full &
// open competitions. "NONE" reads as missing-data; "Full & open" is the
// correct, customer-facing label. Real set-asides ("Total Small Business",
// "8(a)", etc.) pass through unchanged.
function normalizeSetAside(s: unknown): string {
  const v = typeof s === "string" ? s.trim() : "";
  if (!v) return "Full & open";
  const upper = v.toUpperCase();
  if (upper === "NONE" || upper === "FULL AND OPEN" || upper === "FULL & OPEN") return "Full & open";
  return v;
}

function fmtStamp(d: Date | null): string {
  if (!d) return "—";
  const m = MONTHS_SHORT[d.getUTCMonth()];
  const day = d.getUTCDate();
  const yr = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${m} ${day}, ${yr} · ${hh}:${mm} UTC`;
}

function fmtLookup(d: Date | null): string {
  if (!d) return "Not looked up yet";
  const m = MONTHS_SHORT[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `Looked up ${m} ${day} · ${hh}:${mm} UTC`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function fmtCountdown(days: number | null): string {
  if (days == null) return "—";
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

// ─── verdict mapping ────────────────────────────────────────────────────────

function mapVerdict(v: unknown): { word: "GO" | "CAUTION" | "DECLINE"; cls: "v-go" | "v-caution" | "v-decline" } {
  const s = String(v ?? "").toUpperCase();
  if (s === "PROCEED" || s === "GO" || s === "BID") return { word: "GO", cls: "v-go" };
  if (s === "DECLINE" || s === "NO_BID" || s === "NO-BID") return { word: "DECLINE", cls: "v-decline" };
  return { word: "CAUTION", cls: "v-caution" };
}

function verdictTagline(verdict: "GO" | "CAUTION" | "DECLINE", bidRecommendation: string): string {
  if (bidRecommendation) {
    // Take the first sentence (up to ~140 chars) as the tagline.
    const first = bidRecommendation.split(/(?<=[.!?])\s+/)[0] || bidRecommendation;
    return first.length > 200 ? first.slice(0, 197) + "…" : first;
  }
  if (verdict === "GO") return "Biddable — the timing and fit are working in your favor.";
  if (verdict === "DECLINE") return "Pass — the compliance gaps and risk profile don't support a bid.";
  return "Biddable — but only after the open compliance gaps are closed.";
}

// ─── confidence label ───────────────────────────────────────────────────────

function confidenceLabel(c: unknown): { pct: number; label: string } {
  const raw = String(c ?? "").toLowerCase();
  if (raw === "high") return { pct: 94, label: "High confidence" };
  if (raw === "medium" || raw === "med") return { pct: 72, label: "Medium confidence" };
  if (raw === "low") return { pct: 48, label: "Low confidence" };
  // numeric?
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 0 && n <= 100) {
    const lab = n >= 80 ? "High confidence" : n >= 60 ? "Medium confidence" : "Low confidence";
    return { pct: Math.round(n), label: lab };
  }
  return { pct: 72, label: "Medium confidence" };
}

function documentTypeFull(t: string): string {
  const code = t.toUpperCase().trim();
  switch (code) {
    case "RFQ": return "Request for Quote";
    case "RFP": return "Request for Proposal";
    case "IFB": return "Invitation for Bid";
    case "SOURCES SOUGHT": return "Sources Sought";
    case "COMBINED SYNOPSIS": return "Combined Synopsis/Solicitation";
    case "RFI": return "Request for Information";
    case "PWS": return "Performance Work Statement";
    case "SOW": return "Statement of Work";
    default: return t || "Solicitation";
  }
}

// ─── customer hierarchy from fullParentPathName ─────────────────────────────

function deriveHierarchy(agency: string, fullPath: string | null): HierarchyNode[] {
  const path = (fullPath || agency || "").trim();
  if (!path) return [{ text: "—", leaf: true }];
  // SAM v2 uses dot or arrow separators. Examples:
  //   "DEPT OF DEFENSE.DEPT OF THE NAVY.NAVAL SEA SYSTEMS COMMAND"
  //   "DEPT OF DEFENSE > DEPT OF NAVY > NAVSEA"
  const parts = path.split(/\.|>/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return [{ text: agency || "—", leaf: true }];
  return parts.map((text, i) => ({ text, leaf: i === parts.length - 1 }));
}

// ─── compliance flags ───────────────────────────────────────────────────────

function pickSeverity(raw: unknown): "P0" | "P1" | "P2" {
  const s = String(raw ?? "").toUpperCase();
  if (s === "P0" || s === "HIGH" || s === "CRITICAL" || s === "BLOCKER") return "P0";
  if (s === "P2" || s === "LOW" || s === "ADVISORY") return "P2";
  return "P1";
}

interface RawDfarsFlag {
  clause?: string;
  title?: string;
  detected?: boolean;
  severity?: string;
  description?: string;
  required_action?: string;
}

function mapComplianceFlags(compJson: Record<string, unknown>): ComplianceFlag[] {
  // Prefer dfars_flags[] when present — that's the structured analyst output.
  const flags = Array.isArray(compJson.dfars_flags) ? (compJson.dfars_flags as RawDfarsFlag[]) : [];
  const detected = flags.filter((f) => f && f.detected);
  if (detected.length > 0) {
    return detected.map((f) => ({
      clause: String(f.clause ?? "").trim() || "—",
      title: String(f.title ?? "").trim() || "Compliance flag",
      severity: pickSeverity(f.severity),
      description: String(f.description ?? "").trim() || "Clause-level detail not extracted.",
      required_action: String(f.required_action ?? "").trim() || "Verify compliance with this clause before quoting."
    }));
  }
  // Fallback: synthesize from raw far/dfars clause lists. We don't have
  // severity for these — surface as P1 advisories.
  const far = Array.isArray(compJson.far_clauses) ? (compJson.far_clauses as string[]) : [];
  const dfars = Array.isArray(compJson.dfars_clauses) ? (compJson.dfars_clauses as string[]) : [];
  const all = [...dfars, ...far].slice(0, 6);
  return all.map((c) => ({
    clause: String(c).trim(),
    title: "Offeror-action clause",
    severity: "P1",
    description: "Required clause flagged in the solicitation — confirm your response addresses it.",
    required_action: "Verify your proposal addresses this clause before submission."
  }));
}

// ─── risks ──────────────────────────────────────────────────────────────────

interface RawRisk {
  text?: string;
  title?: string;
  priority?: string;
  severity?: string;
  category?: string;
  citation?: string;
  description?: string;
  recommended_action?: string;
  faraudit_action?: string;
  impact?: string;
  provenance?: "verified" | "inferred";
}

function priorityToSev(raw: unknown): "high" | "med" | "low" {
  const s = String(raw ?? "").toUpperCase();
  if (s === "P0" || s === "HIGH" || s === "CRITICAL") return "high";
  if (s === "P2" || s === "LOW" || s === "ADVISORY") return "low";
  return "med";
}

function mapRisks(risksJson: Record<string, unknown>): Risk[] {
  const prioritized = Array.isArray(risksJson.prioritized_risks)
    ? (risksJson.prioritized_risks as RawRisk[])
    : null;
  if (prioritized && prioritized.length > 0) {
    return prioritized
      .filter((r) => r && (r.text || r.title))
      .map((r) => {
        const text = String(r.text ?? r.title ?? "").trim();
        const cite = r.citation || text.match(/((?:FAR|DFARS)\s*\d+\.\d+(?:-\d+)?)/i)?.[1] || "";
        // Provenance from the engine (audit-engine 13f4743+). Old rows pre-
        // date the field — default to "inferred" so the renderer badges them
        // as pattern-derived rather than dropping the badge entirely.
        const provenance: "verified" | "inferred" =
          r.provenance === "verified" || r.provenance === "inferred"
            ? r.provenance
            : "inferred";
        return {
          title: sanitizeDisplayText(String(r.title ?? text.split(".")[0] ?? text).slice(0, 160)),
          severity: priorityToSev(r.priority ?? r.severity),
          citation: String(cite),
          // Design B (2026-06-05): apply the ISO-date guard to risk prose so
          // engine-emitted timestamps render as "11 Jun 2026" rather than
          // "2026-06-11T11:00:00-05:00".
          description: sanitizeDisplayText(text),
          // Engine omits faraudit_action when the action would be canned
          // boilerplate; passing empty string here lets the renderer drop the
          // .risk-action chip entirely rather than show filler.
          faraudit_action: sanitizeDisplayText(String(r.faraudit_action ?? r.recommended_action ?? "").trim()),
          provenance
        };
      });
  }
  // Fallback: pull from category buckets.
  const buckets: Array<{ key: string; sev: "high" | "med" | "low" }> = [
    { key: "top_3_risks", sev: "high" },
    { key: "technical_risks", sev: "med" },
    { key: "schedule_risks", sev: "med" },
    { key: "price_risks", sev: "med" },
    { key: "evaluation_risks", sev: "low" }
  ];
  const out: Risk[] = [];
  for (const b of buckets) {
    const arr = risksJson[b.key];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      if (typeof r !== "string" || !r.trim()) continue;
      const text = r.trim();
      const cite = text.match(/((?:FAR|DFARS)\s*\d+\.\d+(?:-\d+)?)/i)?.[1] || "";
      out.push({
        title: text.split(/[.!?]/)[0].slice(0, 160),
        severity: b.sev,
        citation: cite,
        description: text,
        // Legacy category-bucket fallback path. Engine doesn't synthesize a
        // per-risk action in this path; the renderer drops the action chip
        // entirely rather than show canned filler.
        faraudit_action: "",
        // Without an explicit engine-provided provenance, infer from clause anchor.
        provenance: cite ? "verified" : "inferred"
      });
    }
  }
  return out;
}

function pickHeadlineRisk(risks: Risk[]): Risk {
  if (risks.length === 0) {
    return {
      title: "No risks surfaced",
      severity: "low",
      citation: "",
      description: "FARaudit did not flag a critical exposure in this solicitation.",
      // No risks = no specific action; empty string lets the renderer drop
      // the .risk-action chip rather than show canned advice.
      faraudit_action: "",
      provenance: "inferred"
    };
  }
  const order = { high: 0, med: 1, low: 2 } as const;
  const sorted = [...risks].sort((a, b) => order[a.severity] - order[b.severity]);
  return sorted[0];
}

// ─── score factors ──────────────────────────────────────────────────────────
//
// DESIGN ruling 2026-06-04: derive only when the source data is REAL signal,
// not arithmetic offsets from the overall score. We don't have the per-factor
// scoring engine yet, so return [] and let the renderer hide §00 Scorecard.
// Synthesizing factors from compliance_score ±N% is cosmetic precision and
// gets flagged on the page customers bet $2,500/mo on.

function deriveScoreFactors(): ScoreFactor[] {
  return [];
}

// ─── CLINs ──────────────────────────────────────────────────────────────────

interface RawClin {
  clin?: string;
  description?: string;
  quantity?: string | number;
  unit?: string;
  pricing_arrangement?: string;
  fob?: string;
  status?: string;
}

function mapClins(compJson: Record<string, unknown>, risks: Risk[]): ClinLineItem[] {
  const raw = Array.isArray(compJson.clins) ? (compJson.clins as RawClin[]) : [];
  if (raw.length === 0) return [];
  return raw.map((c) => {
    const desc = String(c.description ?? "—");
    const linkedRisk = risks.find((r) => r.description.includes(String(c.clin ?? "____")) || r.title.includes(String(c.clin ?? "____")));
    const status = String(c.status ?? "").toLowerCase();
    const hasFlag = status === "conflict" || status === "ambiguous" || !!linkedRisk;
    const qtyParts: string[] = [];
    if (c.quantity != null && c.quantity !== "") qtyParts.push(String(c.quantity));
    if (c.unit) qtyParts.push(String(c.unit));
    return {
      clin: String(c.clin ?? "—"),
      description: desc,
      type: String(c.pricing_arrangement ?? "—"),
      qty: qtyParts.join(" ") || "—",
      has_flag: hasFlag,
      flag_label: hasFlag ? (linkedRisk ? linkedRisk.title.slice(0, 64) : status === "conflict" ? "Conflict flagged" : "Ambiguity flagged") : undefined
    };
  });
}

// ─── win themes (derived) ───────────────────────────────────────────────────

function deriveWinThemes(overviewJson: Record<string, unknown>): string[] {
  // Prefer explicit win_themes if present.
  if (Array.isArray(overviewJson.win_themes)) {
    return (overviewJson.win_themes as unknown[])
      .filter((s) => typeof s === "string" && (s as string).trim())
      .map((s) => (s as string).trim())
      .slice(0, 3);
  }
  if (Array.isArray(overviewJson.key_strengths)) {
    return (overviewJson.key_strengths as unknown[])
      .filter((s) => typeof s === "string" && (s as string).trim())
      .map((s) => (s as string).trim())
      .slice(0, 3);
  }
  return [];
}

// ─── KO email body (derive a generic draft if none) ─────────────────────────

function deriveKoBody(audit: AuditRow, headline: Risk, displayId: string): string {
  const stored = audit.ko_email_body as string | undefined;
  if (stored && stored.trim()) return stored;
  const koName = (audit.ko_name as string) || "Contracting Officer";
  const title = String(audit.title ?? displayId);
  const cite = headline.citation || "the open clarification items below";
  return `Dear ${koName},

Thank you for the opportunity to respond to ${displayId} (${title}). We intend to submit and have one clarification that affects how offerors price and structure their responses:

${headline.title}${cite ? ` (${cite})` : ""}. ${headline.description}
${headline.faraudit_action ? `\n${headline.faraudit_action}\n` : ""}
We appreciate your time and look forward to your response ahead of the Q&A deadline.

Respectfully,
[Your Name]
[Company]`;
}

// ─── main ───────────────────────────────────────────────────────────────────

export function buildViewModel(audit: AuditRow, opts?: { isWatching?: boolean }): AuditViewModel {
  // Pull compJson first so the canonical solicitation number (engine-extracted
  // from the SF-18/1449 cover page with hyphens preserved) can override the
  // SAM-metadata solicitation_number when present. This keeps masthead +
  // reasoning + KO email + PDF filename consistent across the report.
  const compJsonEarly = (audit.compliance_json as Record<string, unknown> | null) || {};
  const canonicalSol = (compJsonEarly.solicitation_number_canonical as string | null | undefined) ?? null;
  const displayId = displaySolicitationId({
    solicitation_number: canonicalSol ?? (audit.solicitation_number as string | null | undefined),
    notice_id: audit.notice_id as string | null | undefined,
    title: audit.title as string | null | undefined
  });
  const title = auditDisplayName({
    title: audit.title as string | null | undefined,
    notice_id: audit.notice_id as string | null | undefined,
    solicitation_number: audit.solicitation_number as string | null | undefined,
    created_at: audit.created_at as string | null | undefined
  });

  const compJson = (audit.compliance_json as Record<string, unknown>) || {};
  const risksJson = (audit.risks_json as Record<string, unknown>) || {};
  const overviewJson = (audit.overview_json as Record<string, unknown>) || {};

  const verdict = mapVerdict(audit.recommendation);
  // Honesty flags from audit-engine 13f4743+. compliance_score is now
  // number | null; score_confidence + is_not_solicitation are written into
  // compliance_json by the engine. Pre-13f4743 rows won't have them: derive
  // is_not_solicitation from doc-type + clause counts, and treat compliance_
  // score === null as the source of truth for "unscored".
  const score: number | null = typeof audit.compliance_score === "number"
    ? (audit.compliance_score as number)
    : null;
  const scoreConfidenceRaw = (compJson.score_confidence ?? audit.score_confidence) as string | undefined;
  const isUnscored = score === null || scoreConfidenceRaw === "unscored";
  const isMetadataOnly = compJson.pdf_source === "sam_unavailable";
  // Fallback derivation matches what the engine computes when the row was
  // written by post-13f4743 code, so the rendering stays consistent across
  // both populated and missing-flag rows.
  const farCount = Array.isArray(compJson.far_clauses) ? (compJson.far_clauses as unknown[]).length : 0;
  const dfarsCount = Array.isArray(compJson.dfars_clauses) ? (compJson.dfars_clauses as unknown[]).length : 0;
  const docType = String(audit.document_type ?? "");
  const persistedNotSol = (compJson.is_not_solicitation ?? audit.is_not_solicitation) as boolean | undefined;
  const isNotSolicitation = typeof persistedNotSol === "boolean"
    ? persistedNotSol
    : (docType === "Other" || docType === "Award Notice" || docType === "attachment" ||
       (!isMetadataOnly && farCount === 0 && dfarsCount === 0));

  // PRELIMINARY-READ ADAPTIVE MODES classifier (HANDOFF Jun 4 2026).
  // Three cases the panel adapts to:
  //   "watch"  → pre-solicitation / sources-sought (notice.type signals this)
  //   "fetch"  → doc EXISTS on SAM but our retrieval failed (oversize, network,
  //              or just resourceLinks present without success)
  //   "upload" → true manual fallback (notice claims to be a solicitation but
  //              offers no document, or we have no fetch error to suggest a
  //              re-pull would succeed)
  // Renderer maps "watch" → "upload" until the watcher surface ships.
  const noticeType = String(compJson.notice_type ?? "").toLowerCase();
  const unavailReason = String(compJson.pdf_unavailable_reason ?? "").toLowerCase();
  const titleStr = String(audit.title ?? "").toLowerCase();
  function classifyPrelimMode(): "fetch" | "watch" | "upload" {
    // Tier 1 — explicit notice.type from SAM v2 (most reliable).
    if (
      noticeType.includes("sources sought") ||
      noticeType.includes("presolicitation") ||
      noticeType.includes("special notice") ||
      noticeType.includes("justification")
    ) return "watch";
    // Tier 2 — back-compat for rows that pre-date notice_type persistence.
    // The title often spells "Pre-Solicitation Synopsis" / "Sources Sought" /
    // "RFI" / "Synopsis" before the engine writes notice.type.
    if (
      titleStr.includes("pre-solicitation") ||
      titleStr.includes("presolicitation") ||
      titleStr.includes("sources sought") ||
      titleStr.startsWith("rfi ") ||
      titleStr.startsWith("synopsis ")
    ) return "watch";
    // Tier 3 — fetch-failure hints (oversize, network, generic fetch error).
    if (
      unavailReason.includes("oversize") ||
      /network|timeout|fetch|http \d{3}/i.test(unavailReason)
    ) return "fetch";
    // Tier 4 — manual fallback.
    return "upload";
  }
  const prelimMode = classifyPrelimMode();
  // Watcher surface shipped 2026-06-04: pre-solicitation audits now render
  // the [data-track] watch CTA directly instead of falling back to upload.
  const renderedPrelimMode: "fetch" | "watch" | "upload" = prelimMode;

  // Dates — only show what we actually have. DESIGN ruling 2026-06-04: a Q&A
  // deadline or anticipated-award date presented as fact when we derived it
  // from response_deadline ± offset is a customer liability. Hide > fabricate.
  // qa_deadline + award_date are not in the current schema → never rendered;
  // the renderer drops the corresponding ribbon items + rail clock.
  const now = new Date();
  const responseDeadline = parseDate(audit.response_deadline);
  const responseDays = responseDeadline ? daysBetween(now, responseDeadline) : null;

  // Incumbent
  const incumbentExpiry = parseDate(audit.incumbent_expiry);
  const incumbentLookup = parseDate(audit.incumbent_lookup_at);
  const incumbentAwardValueRaw = audit.incumbent_award_value;
  const incumbentName = (audit.incumbent_name as string) || "";
  const incumbentInitial = incumbentName.trim()[0]?.toUpperCase() || "—";
  const daysToExpiry = incumbentExpiry ? Math.max(0, daysBetween(now, incumbentExpiry)) : 0;
  // Track width is "% of a 5-year cycle elapsed" — bigger = closer to expiry.
  // Use min(120 days / 5 years cycle, 1.0) — but anchor visually so 30 days = ~80%.
  const trackPct = incumbentExpiry
    ? Math.min(100, Math.max(0, 100 - (daysToExpiry / 365) * 50))
    : 50;

  // Classification
  const docTypeRaw = String(audit.document_type ?? "Solicitation");
  const conf = confidenceLabel(audit.document_type_confidence);

  // Compliance + risks
  const complianceFlags = mapComplianceFlags(compJson);
  const risks = mapRisks(risksJson);
  const headlineRisk = pickHeadlineRisk(risks);
  const scoreFactors = deriveScoreFactors();
  const clinLineItems = mapClins(compJson, risks);
  const winThemes = deriveWinThemes(overviewJson);

  // §M Evaluation Factors + §L Submission Compliance — flat passthroughs
  // from compliance_json. The engine's runAudit hoist normalizes the shape
  // (1-indexed rank, Price→Tradeoff/mute, no-profile defaults, recomputed
  // submission_summary) so we trust the values verbatim here.
  const evalBasis = (compJson.eval_basis ?? null) as string | null;
  const evalBasisLabel = (compJson.eval_basis_label ?? null) as string | null;
  const evaluationFactors: EvaluationFactorVM[] = Array.isArray(compJson.evaluation_factors)
    ? (compJson.evaluation_factors as EvaluationFactorVM[])
    : [];
  const submissionRequirements: SubmissionRequirementVM[] = Array.isArray(compJson.submission_requirements)
    ? (compJson.submission_requirements as SubmissionRequirementVM[])
    : [];
  const submissionSummary = (compJson.submission_summary ?? null) as string | null;

  // KO email
  const koTo = (audit.ko_email_recipient as string) || "contracting-officer@agency.mil";
  const koBody = deriveKoBody(audit, headlineRisk, displayId);

  // Win probability — null when basis is 0 or value is missing.
  // DESIGN ruling 2026-06-04: "0%" reads as "0% chance" — show "—" instead.
  const winBasis = typeof audit.win_probability_basis === "number" ? (audit.win_probability_basis as number) : 0;
  const wp: number | null =
    typeof audit.win_probability === "number" && winBasis > 0
      ? Math.round(audit.win_probability as number)
      : null;
  const wpBenchmark = wp != null
    ? `Based on ${winBasis} comparable audit${winBasis === 1 ? "" : "s"}`
    : "Add outcomes to seed the model";

  // Customer hierarchy
  const fullParentPath = (overviewJson.full_parent_path as string) || null;
  const hierarchy = deriveHierarchy((audit.agency as string) || "", fullParentPath);
  const customerOffice = hierarchy[hierarchy.length - 1]?.text || (audit.agency as string) || "—";

  // Incumbent gating — hide entire §02 when no name; hide the .inc-expiry
  // sub-block when no expiry; hide the section-pill unless expiry is within
  // ~6 months (DESIGN ruling: "Recompete window open" pill shouldn't fire on
  // 1,410 days remaining nor on a notice with no incumbent).
  const incumbentHasData = incumbentName.trim().length > 0;
  const incumbentHasExpiry = !!incumbentExpiry;
  const incumbentShowStatus = incumbentHasExpiry && daysToExpiry <= 180;
  const incumbentStatusLabel = incumbentHasExpiry
    ? daysToExpiry <= 180
      ? "Recompete window open"
      : "Long horizon"
    : "";
  // Derived expiry narrative (replaces hardcoded "<4 months… strongest timing
  // signal" caption). DESIGN BLOCKER B 2026-06-04: the demo copy fires on 1410
  // days remaining and contradicts the header. Scale color the same way —
  // amber only when ≤180d, neutral otherwise.
  const incumbentExpiryNote = !incumbentHasExpiry
    ? ""
    : daysToExpiry <= 90
      ? `Expiry inside the next quarter — no recompete posted yet. <b>This is the strongest timing signal a challenger can get.</b>`
      : daysToExpiry <= 180
        ? `Expiry within the next two quarters. With no recompete posted, the timing window is open — track for the solicitation to drop.`
        : daysToExpiry <= 365
          ? `Roughly a year remaining on the current contract. Outside the typical recompete window, but worth shadowing as the period closes.`
          : `Long horizon — ${daysToExpiry.toLocaleString()} days remaining. Track for the next option-exercise decision or recompete cycle.`;
  const incumbentDaysColorOverride = incumbentHasExpiry && daysToExpiry > 180 ? "var(--ink-2)" : null;

  // Derived pill texts (DESIGN #7 + #8)
  const p0 = complianceFlags.filter((f) => f.severity === "P0").length;
  const p1 = complianceFlags.filter((f) => f.severity === "P1").length;
  const p2 = complianceFlags.filter((f) => f.severity === "P2").length;
  const compliancePill = complianceFlags.length === 0
    ? ""
    : [p0 > 0 && `${p0} P0`, p1 > 0 && `${p1} P1`, p2 > 0 && `${p2} P2`].filter(Boolean).join(" · ");
  const riskPill = risks.length === 0 ? "" : `${risks.length} open`;
  // Unscored audits skip the verdict pill text — the renderer shows
  // "Not yet scored" instead of a normal verdict.
  const recommendationPill = isUnscored
    ? "Not yet scored"
    : verdict.word === "GO"
      ? "Bid with confidence"
      : verdict.word === "DECLINE"
        ? "Pass — bid not recommended"
        : "Caution → close gaps before bid";
  const taglineForUnscored = "Upload the PDF to get a full audit score.";

  return {
    solicitation_number: displayId,
    audit_id_short: String(audit.id ?? "").slice(0, 8),
    audit_id_full: String(audit.id ?? ""),
    generated_at: fmtStamp(parseDate(audit.completed_at ?? audit.created_at)),
    page_title: `FARaudit — Audit Report · ${displayId}`,

    title,
    agency: (audit.agency as string) || "—",
    agency_sub: "",
    naics: (audit.naics_code as string) || "—",
    naics_sub: "",
    set_aside: normalizeSetAside(audit.set_aside),
    set_aside_sub: "",
    contract_type: sanitizeDisplayText(overviewJson.contract_type) || "—",
    contract_type_sub: sanitizeDisplayText(overviewJson.period_of_performance),

    recommendation: verdict.word,
    recommendation_class: verdict.cls,
    recommendation_tagline: isUnscored
      ? taglineForUnscored
      : verdictTagline(verdict.word, (audit.bid_recommendation as string) || ""),
    recommendation_pill_text: recommendationPill,
    score,
    score_display: score == null ? "—" : String(Math.round(score)),
    is_unscored: isUnscored,
    is_not_solicitation: isNotSolicitation,
    win_probability: wp,
    win_probability_benchmark: wpBenchmark,
    // Engine-computed (null when score <60) — drives the renderer's
    // hide-when-null gate on .mhv-bench.
    score_benchmark: (compJson.score_benchmark as string | null | undefined) ?? null,

    qa_deadline: "",
    qa_days: "",
    qa_days_num: "",
    response_deadline: fmtDayMonYear(responseDeadline),
    response_days: fmtCountdown(responseDays),
    response_days_num: responseDays != null ? String(Math.max(0, responseDays)) : "",
    response_deadline_short: fmtDueShort(responseDeadline),
    award_date: "",
    has_response_deadline: !!responseDeadline,
    has_qa_deadline: false,
    has_award_date: false,

    // Preliminary-read tiles (metadata-only state). Eligibility intentionally
    // empty until a real per-user determination is wired (capability_statements
    // NAICS match check is the obvious next step). Empty → renderer hides the
    // .mhv-note line per Design.
    prelim_has_deadline: !!responseDeadline,
    set_aside_eligibility: "",
    prelim_mode: prelimMode,
    rendered_prelim_mode: renderedPrelimMode,

    document_type: docTypeRaw,
    document_type_full: documentTypeFull(docTypeRaw),
    document_type_confidence: conf.pct,
    document_type_confidence_label: conf.label,
    document_type_reasoning: (audit.document_type_rationale as string) || "Classification reasoning not recorded.",

    incumbent: {
      has_data: incumbentHasData,
      has_expiry: incumbentHasExpiry,
      show_status_pill: incumbentShowStatus,
      status_label: incumbentStatusLabel,
      name: incumbentName || "No incumbent identified",
      initial: incumbentInitial,
      uei: (audit.incumbent_uei as string) || "—",
      award_value: typeof incumbentAwardValueRaw === "number"
        ? fmtMoney(incumbentAwardValueRaw as number)
        : (incumbentAwardValueRaw as string) || "—",
      expiry: fmtDayMonYear(incumbentExpiry),
      days_to_expiry: daysToExpiry,
      last_lookup: fmtLookup(incumbentLookup),
      track_width_pct: trackPct,
      expiry_note: incumbentExpiryNote,
      days_color_override: incumbentDaysColorOverride
    },

    clin_summary: sanitizeDisplayText(overviewJson.summary) || "Scope summary not available — upload the full PDF to extract scope detail.",
    primary_objective: sanitizeDisplayText(overviewJson.primary_objective) || "Primary objective not extracted.",
    period_of_performance: sanitizeDisplayText(overviewJson.period_of_performance) || "Period of performance not extracted.",
    customer_office: customerOffice,
    customer_hierarchy: hierarchy,
    contract_type_detail: sanitizeDisplayText(overviewJson.contract_type_detail) || sanitizeDisplayText(overviewJson.contract_type) || "Contract vehicle detail not extracted.",
    clin_line_items: clinLineItems,

    compliance_flags: complianceFlags,
    compliance_pill_text: compliancePill,
    risks,
    risk_pill_text: riskPill,
    headline_risk: headlineRisk,
    // Also suppress the moment band on wrong-doc audits — its "the catch
    // you'd have missed" copy is meaningless when the document isn't even a
    // solicitation; the not-solicitation banner covers that messaging.
    show_moment_band: risks.length > 0 && !isNotSolicitation,
    score_factors: scoreFactors,

    // §M Evaluation Factors + §L Submission Compliance — sourced from
    // compliance_json which the engine populates via Call 1 (Overview)
    // extraction + server-side hoist. Empty arrays + nulls signal "hide
    // the section" to the renderer (false-precision gate).
    eval_basis: evalBasis,
    eval_basis_label: evalBasisLabel,
    evaluation_factors: evaluationFactors,
    submission_requirements: submissionRequirements,
    submission_summary: submissionSummary,

    recommendation_rationale: sanitizeDisplayText(audit.bid_recommendation as string) || "Recommendation rationale not recorded.",
    recommendation_win_themes: winThemes,

    ko_email_to: koTo,
    ko_email_body: koBody,

    is_metadata_only: !!isMetadataOnly,
    is_watching: !!opts?.isWatching,
    pdf_export_url: `/api/audit/${audit.id}/pdf`,

    conf_ring_pct: conf.pct
  };
}

// ─── money formatter ────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("en-US")}`;
}
