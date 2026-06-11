// View model for the audit-report page.
//
// Maps a raw `audits` Supabase row + its sibling JSONB columns into the shape
// the design template's data-field attributes expect. Fields the design needs
// that the current schema doesn't carry (score_factors, win_themes, qa_deadline,
// award_date) are derived from neighbors or filled with sensible defaults so
// the 1:1 visual port renders without demo strings or blank sections.

import { displaySolicitationId, auditDisplayName } from "@/lib/audit-display";
import { suppressContradictedConfidenceNotes } from "./_v2-render-surfaces";
import type { AuditConfidenceNote } from "@/lib/audit-judgment";

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
  // Engine-emitted category (RiskFinding.category vocabulary: "Disqualification",
  // "DFARS_Trap", "Technical", "Schedule", "Price", "Evaluation", "Compliance",
  // plus lowercase variants from custom detectors — "pricing", "market-structure",
  // "compliance", "Manual review"). Optional because legacy bucket-fallback path
  // can't always supply one; W3-L02 filter uses it for non-clarifiable exclusion.
  category?: string;
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
  nsn?: string;
  psc?: string;
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

  // Fix 2 (2026-06-05 — Ruling 1 wiring). 'gate' when the engine emitted a
  // DECISION_GATE verdict (one or more credential/sole-source gates fired);
  // 'scored' otherwise. Renderer reads this to switch to the interactive
  // gate template. When 'gate', fit_score is suppressed (set to null) and
  // is_unscored is NOT triggered — gate audits made a decision, just not
  // on a numeric score.
  verdict_mode: "gate" | "scored";

  // Brain QA Item 1 (2026-06-05): the masthead .mhv-gates + the §06
  // .gate-card both read from this array when verdict_mode === 'gate'. Each
  // entry maps an engine DecisionGate to a renderable condition row.
  gate_conditions: Array<{
    title: string;       // Short condition headline (gate_label core)
    context: string;     // Inline context (e.g. CAGE / vendor / brief verification)
    citation: string;    // Clause cite or "—" when none (e.g. "DFARS 252.204-7020")
    blocker_note: string; // "UNFIXABLE IN N DAYS IF MISSING" when not curable, else ""
  }>;

  // FA-112: gate_pearl ("catch worth the subscription" band). No engine surface
  // exists yet — defaults to null. Renderer replaces inner when populated,
  // strips the entire <div class="g-pearl"> element when null. Prevents the
  // template's demo procurex / reverse-auction copy from leaking on audits
  // that don't have a hero L02 catch.
  gate_pearl: string | null;

  // ─── Fork 3 surfaces (2026-06-05) ────────────────────────────────────────
  // Six new template surfaces from Design's Fork 3 capture package; markup
  // pinned at ceo/redesign-final/platform/audit-report.html. Data layer
  // ships here; renderer wires on the next template re-pull.

  // Executive Summary (.exec-sum) — engine-emitted text, view-model just
  // splits the verdict word into the CSS class. es-go / es-caution / es-nobid.
  exec_verdict: string;
  exec_what: string;
  exec_factors: string[];
  exec_actions: Array<{ when: string; text: string }>;
  exec_class: "es-go" | "es-caution" | "es-nobid";

  // Timeline (.timeline) — derived from posted date + Q&A deadline +
  // response deadline + award estimate. Status drives color: ok (green-ish),
  // warn (amber, within 14 days), bad (past or missed).
  timeline_gates: Array<{ date: string; label: string; status: "ok" | "warn" | "bad" }>;

  // §07 Compliance Matrix (.cmatrix) — derived from far/dfars clauses +
  // Section L requirements + Section M factors. Status: action (offeror
  // submission required), risk (cited in the risk register), clear (cited
  // but no extracted gap).
  compliance_matrix: Array<{ requirement: string; source: string; status: "action" | "risk" | "clear" }>;
  // Standalone matrix CSV/PDF export. The renderer wires this to the
  // .cmatrix download button. Endpoint follows existing /api/audit/<id>/pdf
  // shape — a fast-follow lambda will serve the matrix as a separate doc.
  matrix_export_url: string;

  // §08 KO Email card (.ko-card) — FA-125: ONE generator feeds both the card
  // preview and the drawer body (ko_email_body === ko_email.preview).
  // has_asks=false ⇒ no draft exists — render the "no clarifications needed"
  // state (no Draft-ready pill, no open/copy actions). to_found=false ⇒ the
  // to string is the CO-not-found message, not an address.
  ko_email: { to: string; to_found: boolean; subject: string; preview: string; has_asks: boolean };

  // §09 Submission Checklist (.checklist) — grouped from Section L
  // requirements. group: before (pre-submission registration/certs),
  // §09 Pre-flight Checklist — Phase 2 #1 (F1 catastrophic fix, Jun 8 2026).
  // Six canonical buckets in render order: deadline → registration →
  // mandatory_doc → representation → format → other. Critical buckets
  // (deadline / registration / mandatory_doc) get .is-critical styling.
  // Renderer drives data-field="submission_checklist_filtered" on the §09
  // wrapper. Replaces the legacy 3-bucket (before/with/after) shape.
  submission_checklist_filtered: Array<{
    bucket: "deadline" | "registration" | "mandatory_doc" | "representation" | "format" | "other";
    label: string;
    critical: boolean;
    items: Array<{
      bucket: "deadline" | "registration" | "mandatory_doc" | "representation" | "format" | "other";
      text: string;
      source: string;
      isCritical: boolean;
      complete: boolean;
    }>;
  }>;

  // §03 work-statement reveal — Phase 2 #3 (floor, Jun 8 2026).
  // EXACTLY ONE of work_statement / work_statement_unknown is non-null. The
  // renderer never leaves §03 without a reveal block — silent vanishing is
  // a regression. Trigger: known on document_type ∈ {SOW,PWS,SOO,combined};
  // unknown on every other type incl. RFP/RFQ/IFB/Other/null. Confidence ===
  // "low" stays in the known block as a "Tentative" chip — do NOT fall to
  // amber unknown on low-confidence-known. Future ceiling (V2): real
  // SOW/PWS/SOO classification from attachment parsing.
  work_statement: {
    abbr: "SOW" | "PWS" | "SOO" | "combined";
    full: string;
    meaning: string;
    evidence: string;
    confidence: "High confidence" | "Medium confidence" | "Tentative";
    bid_strategy: string;
  } | null;
  work_statement_unknown: {
    head: string;
    reason: string;
    action: string;
  } | null;

  // §02 no-incumbent variant (.inc-none) — renderer branches on
  // has_incumbent: true → render .incumbent block; false → render .inc-none
  // with the head + note copy.
  has_incumbent: boolean;
  incumbent_none_head: string;
  incumbent_none_note: string;

  // ─── Canonicalization layer (2026-06-06, Brain ruling) ────────────────────
  // Single source of truth for verdict + gate prose. Hosted-inference variance
  // (batch-invariance failure on the Anthropic API) means raw audit_json isn't
  // byte-stable even at temperature 0 — so the rendered REPORT must be made
  // byte-stable via deterministic TS canonicalization on top of variable
  // model output. These fields kill three observed intra-render
  // contradictions from SPRRA run 3:
  //   1. masthead/exec said CAUTION while §06 .gate-verdict said NO-BID
  //   2. §06 .gc-lead said "all three gates" while gate_conditions.length === 2
  //   3. §06 .gc-lead said "20-day window" while engine said "19 days"

  // The ONE verdict word — BID | CAUTION | NO-BID. Masthead .mhv-word, exec
  // .es-vw, §06 .gs-pill, §06 .gate-verdict all read this value. Computed
  // from gate aggregator when gates exist, else from compliance_score band.
  verdict_word: "BID" | "CAUTION" | "NO-BID";

  // One canonical days-to-deadline value, computed from one fixed `now` per
  // VM build. All "N days" references read this (no more "19 days" vs
  // "20-day" mismatch within a single render). Null when no deadline known.
  days_to_deadline: number | null;

  // Canonical §06 .gate-card prose, composed from gate count + per-gate
  // curability + days_to_deadline. Replaces the hardcoded Design demo text
  // ("NO-BID — unless all three are true today" / "20-day window") with
  // template-data driven prose tied to the actual gate set.
  gate_card: {
    verdict_text: string;       // .gate-verdict text inside .gc-h
    lead_text: string;          // .gc-lead text
    count_text: string;         // .gs-cnt initial "0 / N cleared"
    pill_text: "BID" | "NO-BID"; // .gs-pill initial — NO-BID by default,
                                 // user resolver flips to BID on full check
    // Phase 3 E7 (F7) — outcome lead words inside .g-oc.win/.g-oc.no <b>
    // prefix. Derived from gate count so "All three ✓" never leaks on a
    // 2-gate audit. Renderer regex-replaces only the <b>...</b> content.
    outcome_win_lead: string;   // "All three" / "Both" / "All 5" / "If the gate clears"
    outcome_no_lead: string;    // "Any" / "If it fails"
    // FA-115 Pass 4 Item 5 — outcome TAIL text (after the </b>, before the
    // </div>). The template ships demo copy ("→ straightforward LPTA win on
    // price + packaging. Low competition.") that leaked on active gate-mode
    // reports because applyCanonicalVerdict only replaced the <b> lead. The
    // tail is now VM-derived and references the SINGLE evaluation framing
    // (eval_basis_label) so §06 can never contradict §M's award basis.
    outcome_win_tail: string;
    outcome_no_tail: string;
  };

  // key dates — Phase 2 #4 (Jun 8 2026): qa_deadline + award_date now parsed
  // from audit row (with compJson fallback). Renderer drops the ribbon item
  // when has_* is false; .kd-item + .kd-item::before pseudo-divider auto-reflows.
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
  // Derived fiscal-quarter for the .cnt span next to award_date (e.g. "Q4 FY26").
  // Empty when award_date is null OR uncomputable → renderer drops the .cnt span.
  award_quarter: string;
  // Field key of the single soonest UPCOMING date (qa_deadline / response_deadline
  // / award_date). Empty when no upcoming date remains → renderer adds no .urgent
  // class. Computed from one fixed `now` per run for determinism.
  urgent_field: "" | "qa_deadline" | "response_deadline" | "award_date";
  // Phase A.0 defect fix (Jun 8 2026): .kd-note text was hardcoded demo
  // string in template. Now data-driven — renderer strips .kd-note unless
  // (has_qa_deadline AND key_dates_note non-empty). Default "" so the demo
  // never leaks on real audits. Currently never populated by derivation —
  // future ticket can wire it from engine output if a real note is emitted.
  key_dates_note: string;
  has_response_deadline: boolean;
  has_qa_deadline: boolean;
  has_award_date: boolean;
  has_award_quarter: boolean;
  // FA-107: true when response_deadline is in the past. Renderer overlays an
  // "SOLICITATION CLOSED" banner and suppresses the KO email card.
  is_expired: boolean;
  // FA-108: true when the audit's owner has no capability_statements row.
  // Renderer treats this as a soft lock — score forced to null + gate-mode
  // suppression triggered via the existing injectVerdictModeCall path.
  // Defaults to false unless caller passes opts.hasCapabilityStatement=false.
  // CTA tile-replacement copy ("Complete your Capability Statement to unlock
  // your Fit Score") lands in a follow-up commit alongside the Supabase
  // capability_statements presence query in the page/PDF routes.
  score_locked: boolean;

  // V2 cutover B2 — count of shadow-populated items for each surface the strip
  // pass cares about. Default 0 when no v2_shadow present (V1 audits). Drives
  // stripHideWhenEmptyBlocks: if length > 0, V2 overlay will populate the block
  // and strip must skip it; if 0, strip removes the empty-state template demo.
  v2_surface_lengths?: { l02_catches: number; confidence_notes: number };

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
// Defect 4 (2026-06-05): tolerate line-split inside ISO segments. Audit-AI
// extraction occasionally breaks a date like "2026-06-\n11T11:00" mid-token,
// which the original \b\d{4}-\d{2}-\d{2}T regex skipped. \s* between segments
// allows the regex to span line breaks without over-matching unrelated text
// (anchored on the YYYY-MM-DD prefix). Pre-pass collapses internal whitespace
// inside ISO-shaped runs before the bare-token sweep.
const ISO_LINESPLIT_RE = /\b(\d{4}-\d{2}-)\s+(\d{2}T\d{2})/g;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
// Defect 4 polish (2026-06-05 P2 follow-up): bare YYYY-MM-DD forms (no
// timestamp suffix) leaked through the ISO regex on QB risk prose. The
// bare-date regex runs AFTER the ISO sweep so an ISO that already reformatted
// to "11 Jun 2026" doesn't get touched. Same MONTHS_SHORT formatter.
const DATE_ONLY_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
// Fix 2 (2026-06-05 — Ruling 2 follow-up): hybrid YYYY-MMM-DD form (e.g.
// "2026-JUN-25") slipped through the numeric ISO regex on SPRRA. Three-letter
// month abbreviation — case-insensitive match. Resolved to "DD Mon YYYY".
const HYBRID_DATE_RE = /\b(\d{4})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{1,2})\b/gi;
const MONTH_ABBR_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function sanitizeDisplayText(s: unknown): string {
  if (s == null) return "";
  let out = String(s);
  // Pre-pass: collapse line-split ISO tokens back together so the main regex
  // can match them. Audit-AI extraction can emit "2026-06-\n11T11:00".
  out = out.replace(ISO_LINESPLIT_RE, "$1$2");
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
  // Defect 4 polish: bare YYYY-MM-DD with no T-suffix → "D Mon YYYY".
  // Construct the Date with explicit UTC components so timezone math can't
  // drift the day across midnight.
  out = out.replace(DATE_ONLY_RE, (m, y, mo, day) => {
    const yi = Number(y), mi = Number(mo), di = Number(day);
    if (!Number.isFinite(yi) || !Number.isFinite(mi) || !Number.isFinite(di)) return m;
    if (mi < 1 || mi > 12 || di < 1 || di > 31) return m;
    return `${di} ${MONTHS_SHORT[mi - 1]} ${yi}`;
  });
  // Fix 2 (Ruling 2 follow-up): YYYY-MMM-DD hybrid → "D Mon YYYY".
  out = out.replace(HYBRID_DATE_RE, (m, y, mo, day) => {
    const idx = MONTH_ABBR_INDEX[String(mo).toLowerCase()];
    const yi = Number(y), di = Number(day);
    if (idx == null || !Number.isFinite(yi) || !Number.isFinite(di)) return m;
    if (di < 1 || di > 31) return m;
    return `${di} ${MONTHS_SHORT[idx]} ${yi}`;
  });
  // Clean up doubled spaces / dangling punctuation left by the strip.
  out = out.replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").trim();
  return out;
}

// Defect 1 (2026-06-05 P0): provenance upgrade. The engine's DOCUMENT_ANCHOR_RE
// missed Section #s, CFR cites, TO #s, dated references, and part-number-ish
// strings on QH — 10/10 risks tagged "≈ Pattern" despite quoting "Section 1.2",
// "14 CFR 145.215", "TO 9H2-4-96-13 (1 Apr 2025)". This view-model post-pass
// upgrades a risk to provenance="verified" when its concatenated text/citation/
// description contains any document-anchored pattern. Runs on every render so
// existing audit_json rows without re-audit also benefit.
const DOCUMENT_ANCHOR_PATTERNS: RegExp[] = [
  /\b(?:FAR|DFARS)\s*\d+\.\d+(?:-\d+)?/i,           // FAR/DFARS clause #s
  /\b\d{1,3}\s*CFR\s*\d+(?:\.\d+)?/i,                // CFR cites (e.g. "14 CFR 145.215")
  /\bSection\s+\d+(?:\.\d+){0,3}/i,                  // "Section 1.2", "Section 5.3.2"
  /\b§\s*\d+(?:\.\d+){0,3}/,                         // "§L.4", "§M"
  /\bCAGE\s*(?:Code\s*)?[A-Z0-9]{3,5}\b/i,           // CAGE
  /\bNSN\s*[\d-]+/i,                                  // NSN
  /\bNAICS\s*\d{4,6}\b/i,                            // NAICS
  /\bDoDAAC\s*[A-Z0-9]{6,}/i,                        // DoDAAC
  /\bTO\s+\d+[A-Z]?\d*-[\d-]+/i,                     // TO (Technical Order) #
  /\bP\/N\s*[\dA-Z][\dA-Z\-]*/i,                     // Part number
  /\b252\.\d{3}-\d{4}/,                              // bare DFARS
  /\b5352\.\d{3}-\d{4}/,                             // bare AFFARS
  /\b\d{4}-\d{2}-\d{2}\b/,                           // ISO date
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i,  // "1 Apr 2025"
  /\$\s*[\d][\d,]{2,}/                               // Dollar amount
];
function hasDocumentAnchor(...fields: Array<string | undefined | null>): boolean {
  const joined = fields.filter((f) => typeof f === "string" && f.length > 0).join(" · ");
  if (!joined) return false;
  return DOCUMENT_ANCHOR_PATTERNS.some((re) => re.test(joined));
}

// Set-aside normalization (FA-115 Pass 4 Item 2). SAM and engine code paths
// emit a wide range of raw set-aside tokens — "SBA", "Total Small Business",
// "WOSB", "EDWOSB", "8(A)", "HUBZONE", "SDVOSB", "NONE". The masthead must
// show the customer-facing display label, not the raw code. Mapping table
// covers known codes; unknown values pass through verbatim (never invent).
const SET_ASIDE_LABEL: Record<string, string> = {
  // Full & open competition synonyms
  "":                            "Full & Open",
  "NONE":                        "Full & Open",
  "FULL AND OPEN":               "Full & Open",
  "FULL & OPEN":                 "Full & Open",
  "UNRESTRICTED":                "Full & Open",
  // Total small business (any structure)
  "SBA":                         "Small Business — 100%",
  "TOTAL SMALL BUSINESS":        "Small Business — 100%",
  "SMALL BUSINESS":              "Small Business — 100%",
  "SMALL BUSINESS SET-ASIDE":    "Small Business — 100%",
  "TOTAL_SMALL_BUSINESS":        "Small Business — 100%",
  "SBA_TOTAL_SB":                "Small Business — 100%",
  // Socio-economic categories
  "WOSB":                        "Women-Owned Small Business (WOSB)",
  "WOMEN-OWNED SMALL BUSINESS":  "Women-Owned Small Business (WOSB)",
  "EDWOSB":                      "Economically Disadvantaged WOSB (EDWOSB)",
  "SDVOSB":                      "Service-Disabled Veteran-Owned Small Business (SDVOSB)",
  "SDVOSBC":                     "Service-Disabled Veteran-Owned Small Business (SDVOSB)",
  "VOSB":                        "Veteran-Owned Small Business (VOSB)",
  "HUBZONE":                     "HUBZone Small Business",
  "HUB ZONE":                    "HUBZone Small Business",
  "8(A)":                        "8(a) Sole-Source / Competitive",
  "8A":                          "8(a) Sole-Source / Competitive",
  "8A_COMPETED":                 "8(a) Competitive",
  "8A_SOLE_SOURCE":              "8(a) Sole-Source",
};

function normalizeSetAside(s: unknown): string {
  const v = typeof s === "string" ? s.trim() : "";
  const key = v.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(SET_ASIDE_LABEL, key)) {
    return SET_ASIDE_LABEL[key];
  }
  // Unknown value — pass through verbatim. Never invent.
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

// Key-dates ribbon variant — collapses past dates to "closed" instead of the
// "N days ago" form. Brief: countdown reads "in N days" / "today" / "closed"
// (Phase 2 #4 / Jun 8 2026). Returns "" when uncomputable → renderer drops
// the .cnt span entirely (never an empty pill).
function fmtKdCountdown(days: number | null): string {
  if (days == null) return "";
  if (days < 0) return "closed";
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

// US federal fiscal year — runs Oct 1 → Sep 30, named after the calendar year
// it ends in (FY26 = Oct 1 2025 – Sep 30 2026). Returns "" when input is null
// so the renderer drops the .cnt span when uncomputable.
function fiscalQuarter(d: Date | null): string {
  if (!d) return "";
  const m = d.getUTCMonth(); // 0=Jan … 11=Dec
  const y = d.getUTCFullYear();
  // Q1 Oct-Dec → FY = calendar year + 1; Q2 Jan-Mar; Q3 Apr-Jun; Q4 Jul-Sep.
  let q: 1 | 2 | 3 | 4;
  let fy: number;
  if (m >= 9)         { q = 1; fy = y + 1; }
  else if (m <= 2)    { q = 2; fy = y;     }
  else if (m <= 5)    { q = 3; fy = y;     }
  else                { q = 4; fy = y;     }
  const fyShort = String(fy).slice(-2);
  return `Q${q} FY${fyShort}`;
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
    // Brain Q4 ruling (Cycle 2 Fix 4): §04 sources from risk_findings filtered to
    // offerorActionRequired === true — every flag carries its own mitigation language
    // because the source risk did. The "Clause-level detail not extracted." /
    // "Verify compliance with this clause before quoting." fallback strings are
    // eliminated by construction. Empty description / required_action → renderer
    // hides the flag (data-hide-when-empty="compliance_flags" on §04 wrapper).
    // All-inferred sets render with a "inferred — verify against solicitation text"
    // confidence indicator at the renderer layer.
    return detected
      .map((f) => ({
        clause: String(f.clause ?? "").trim() || "—",
        title: String(f.title ?? "").trim() || "Compliance flag",
        severity: pickSeverity(f.severity),
        description: String(f.description ?? "").trim(),
        required_action: String(f.required_action ?? "").trim(),
      }))
      // Drop flags with no real content — fail-loud rather than fallback.
      .filter((f) => f.description.length > 0 || f.required_action.length > 0);
  }
  // FA-127 — no generic-advisory fallback. Synthesizing first-6 raw clauses
  // as boilerplate "Offeror-action clause" rows printed fabricated counts
  // that contradicted the real detection state. Zero detected flags renders
  // the truthful §04 empty-state instead.
  return [];
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
        const engineProvenance: "verified" | "inferred" =
          r.provenance === "verified" || r.provenance === "inferred"
            ? r.provenance
            : "inferred";
        // Defect 1 (2026-06-05 P0): upgrade engine's "inferred" to "verified"
        // when the risk's prose carries any document-anchored pattern. Engine
        // ANCHOR_RE missed Section #s / CFR / TO / dated references on QH.
        const provenance: "verified" | "inferred" =
          engineProvenance === "verified" || hasDocumentAnchor(text, String(cite), String(r.title ?? ""))
            ? "verified"
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
          provenance,
          // W3-L02 — propagate engine-emitted category so the KO email filter
          // can exclude non-clarifiable risks (pricing, market-structure, etc.).
          category: typeof r.category === "string" ? r.category : undefined,
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
  nsn?: string;
  part_number?: string;
  psc?: string;
}

// Format an ISO date (YYYY-MM-DD) into the same "DD MMM YYYY" shape the rest
// of the report uses (audit-engine.ts:1128/2627/2937). Pass-through anything
// that isn't a clean ISO date — qty cells often legitimately read "60 mo" or
// "12,000 hrs" which should not be touched.
function formatQtyValue(raw: string): string {
  const trimmed = raw.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (!iso) return raw;
  const d = new Date(trimmed + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
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
    if (c.quantity != null && c.quantity !== "") qtyParts.push(formatQtyValue(String(c.quantity)));
    if (c.unit) qtyParts.push(String(c.unit));
    // NSN preferred; fall back to part_number when only that exists. Brief: emit
    // only when present, never invent.
    const nsnRaw = c.nsn ?? c.part_number;
    const nsn = nsnRaw != null && String(nsnRaw).trim() ? String(nsnRaw).trim() : undefined;
    const psc = c.psc != null && String(c.psc).trim() ? String(c.psc).trim() : undefined;
    return {
      clin: String(c.clin ?? "—"),
      description: desc,
      type: String(c.pricing_arrangement ?? "—"),
      qty: qtyParts.join(" ") || "—",
      has_flag: hasFlag,
      flag_label: hasFlag ? (linkedRisk ? linkedRisk.title.slice(0, 64) : status === "conflict" ? "Conflict flagged" : "Ambiguity flagged") : undefined,
      nsn,
      psc
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

// ═══════════════════════════════════════════════════════════════════════════
// Fork 3 derivation helpers (2026-06-05). Six new surfaces from Design's
// capture package — markup pinned at ceo/redesign-final/platform/audit-report.html.
// Every field is derived from existing engine output; no new LLM call.
// ═══════════════════════════════════════════════════════════════════════════

function deriveExecClass(rec: "GO" | "CAUTION" | "DECLINE"): "es-go" | "es-caution" | "es-nobid" {
  if (rec === "GO") return "es-go";
  if (rec === "DECLINE") return "es-nobid";
  return "es-caution";
}

// Brain ruling — canonicalization (2026-06-06 + Cycle-1 fact-layer fix).
// Gate detection lives in the VM (DERIVED layer) and scans the FULL stored
// extraction corpus, not just dfars_clauses. The engine-side detection used
// to gate on dfars_clauses[] alone — when the compliance call returned
// empty arrays (the 0-vs-68 case observed on fixture A), gate detection
// missed SPRS even though it sat in risks_json.dfars_trap_risks prose.
// The VM rebuilds the corpus from EVERY stored text field and re-detects;
// this absorbs the model-layer variance and produces byte-stable gates
// across runs where the underlying signal is present somewhere in the
// stored JSON.

// Regex patterns — local copies of the engine's gate detectors. Keep in sync
// with src/lib/audit-engine.ts. Cycle-2 will deprecate the engine detectors
// once the VM is the sole source of truth.
const VM_SPRS_TEXT_RE  = /\bSPRS\b|Supplier\s+Performance\s+Risk\s+System|NIST\s*SP\s*800-171\s+(?:Basic\s+)?Assessment/i;
const VM_SPRS_CLAUSE_RE = /252\.204-7019|252\.204-7020|252\.204-7012/;
const VM_JCP_RE        = /\bJCP\b|JCP[-\s]?(?:certified|cert|certification)|Joint\s+Certification\s+Program|DD\s*Form\s*2345|militarily\s+critical\s+technical\s+data|noncommercial\s+technical\s+data|252\.227-7025/i;
const VM_FAA145_RE     = /FAA\s*Part\s*145|14\s*CFR\s*145|FAA[-\s]?approved\s+repair\s+station|repair\s+station\s+rating/i;
const VM_TEST_JIG_RE   = /test\s*jig|specialized\s+test\s+equipment|government[-\s]furnished\s+test|special\s+test\s+equipment/i;
const VM_AFTO_RE       = /\bAFTO\b|Air\s*Force\s*Technical\s*Order|TO\s+\d+[A-Z]?\d*-[\d-]+/i;

// Build a text corpus from every stored audit field that could carry a gate
// signal. Comprehensive coverage — when one field is missing/empty (model
// variance), the same signal usually surfaces in a sibling field.
function buildGateCorpus(
  audit: AuditRow,
  compJson: Record<string, unknown>,
  risksJson: Record<string, unknown>,
  overviewJson: Record<string, unknown>
): string {
  const parts: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.length > 0) parts.push(v); };
  // Audit row summary fields
  push(audit.overview_summary);
  push(audit.compliance_summary);
  push(audit.risks_summary);
  push(audit.title);
  // Overview JSON
  push(overviewJson.summary);
  push(overviewJson.scope);
  push(overviewJson.primary_objective);
  push(overviewJson.contract_type_detail);
  // Compliance JSON — clause arrays + cert/action arrays + Section L/M summaries
  if (Array.isArray(compJson.far_clauses)) for (const c of compJson.far_clauses) push(c);
  if (Array.isArray(compJson.dfars_clauses)) for (const c of compJson.dfars_clauses) push(c);
  if (Array.isArray(compJson.required_certifications)) for (const c of compJson.required_certifications) push(c);
  if (Array.isArray(compJson.key_compliance_actions)) for (const a of compJson.key_compliance_actions) push(a);
  push(compJson.section_l_summary);
  push(compJson.section_m_summary);
  if (Array.isArray(compJson.submission_requirements)) {
    for (const r of compJson.submission_requirements as Array<{ requirement?: unknown }>) push(r?.requirement);
  }
  // Risks JSON — prioritized + dfars_trap_risks + executive summary + per-category
  push(risksJson.executive_risk_summary);
  if (Array.isArray(risksJson.prioritized_risks)) {
    for (const r of risksJson.prioritized_risks as Array<Record<string, unknown>>) {
      push(r.text); push(r.title); push(r.citation); push(r.faraudit_action);
    }
  }
  if (Array.isArray(risksJson.dfars_trap_risks)) {
    for (const t of risksJson.dfars_trap_risks as Array<Record<string, unknown>>) {
      push(t.trap_name); push(t.specific_risk); push(t.required_verification);
    }
  }
  for (const arrKey of ["top_3_risks", "technical_risks", "schedule_risks", "price_risks", "evaluation_risks"]) {
    const arr = (risksJson as Record<string, unknown>)[arrKey];
    if (Array.isArray(arr)) for (const v of arr) push(v);
  }
  return parts.join(" \n ");
}

// VM-side canonical gate detector. Scans the full stored corpus and emits a
// deterministic gate set. Absorbs extraction-layer variance — fixtures where
// dfars_clauses came back empty still detect SPRS if SPRS prose lives in
// any sibling field (risks_json.dfars_trap_risks, executive_risk_summary,
// section_l_summary, etc).
//
// Curability gating uses one canonical daysToDeadline value (passed in).
// SPRS: 30-day posting lag + 5-day buffer = curable if >= 35 days.
// JCP: 5-10 BD processing + buffer = curable if >= 15 days.
// FAA145, test jig, AFTO: not curable in typical solicitation windows.
function detectGatesCanonical(
  corpus: string,
  daysToDeadline: number | null
): Array<{ gate_id: string; gate_label: string; status: "OPEN" | "CLOSED" | "UNKNOWN"; cure_possible_in_window: boolean; verification_url?: string; verification_action: string; named_entity?: string }> {
  const gates: Array<{ gate_id: string; gate_label: string; status: "OPEN" | "CLOSED" | "UNKNOWN"; cure_possible_in_window: boolean; verification_url?: string; verification_action: string; named_entity?: string }> = [];
  // SPRS
  if (VM_SPRS_TEXT_RE.test(corpus) || VM_SPRS_CLAUSE_RE.test(corpus)) {
    gates.push({
      gate_id: "SPRS_SCORE_REQUIRED",
      gate_label: "Current SPRS score required",
      status: "UNKNOWN",
      cure_possible_in_window: daysToDeadline != null && daysToDeadline >= 35,
      verification_url: "https://www.sprs.csd.disa.mil/",
      verification_action: "Verify your SPRS Basic Assessment is posted and current (within 3 years) before the response deadline."
    });
  }
  // JCP
  if (VM_JCP_RE.test(corpus)) {
    gates.push({
      gate_id: "JCP_CERTIFICATION_REQUIRED",
      gate_label: "Joint Certification Program certification required",
      status: "UNKNOWN",
      cure_possible_in_window: daysToDeadline != null && daysToDeadline >= 15,
      verification_url: "https://www.dla.mil/HQ/Acquisition/Offers/JCP/",
      verification_action: "Submit DD Form 2345 to JCP and post the certification to SAM.gov before the response deadline."
    });
  }
  // FAA Part 145
  if (VM_FAA145_RE.test(corpus)) {
    gates.push({
      gate_id: "FAA_145_SPECIFIC_PNS",
      gate_label: "FAA Part 145 repair station rating required",
      status: "UNKNOWN",
      cure_possible_in_window: false,
      verification_action: "Confirm your FAA Part 145 repair station rating covers the specific P/Ns / class ratings in this solicitation."
    });
  }
  // Test jig
  if (VM_TEST_JIG_RE.test(corpus)) {
    gates.push({
      gate_id: "TEST_JIG_APPROVAL",
      gate_label: "Specialized test jig / equipment required",
      status: "UNKNOWN",
      cure_possible_in_window: false,
      verification_action: "Confirm access to (or ability to procure/build) the specified test jig before quoting; lead times typically exceed solicitation windows."
    });
  }
  // AFTO
  if (VM_AFTO_RE.test(corpus)) {
    gates.push({
      gate_id: "AFTO_ACCESS",
      gate_label: "Air Force Technical Order access required",
      status: "UNKNOWN",
      cure_possible_in_window: false,
      verification_action: "Confirm AFTO access via existing TO library agreement OR teaming arrangement with a holding contractor."
    });
  }
  return gates;
}

// Brain ruling — canonicalization (2026-06-06). Composes the §06 .gate-card
// prose deterministically from the actual gate set + curability + days-to-
// deadline. Replaces the template's hardcoded SPRRA-flavored demo strings
// ("all three are true today" / "20-day window") with prose that tracks the
// real audit. Per-gate logic, never blanket: "all uncurable" → NO-BID;
// FA-115 Pass 4 Item 5 — single-source evaluation framing. compliance_json
// carries eval_basis (verbatim §M prose) + eval_basis_label (engine short
// label, often null on older rows). The report had THREE divergent framings
// (§M best-value tradeoff / §06 "LPTA win" / §05 three-lowest-price) because
// each surface invented its own. This derivation is the ONE source: prefer
// the engine label, else detect from the eval_basis prose (same patterns as
// section-extractors.ts eval-method detection), else null. §M pill + §06
// gate-outcome copy both reference the result.
function deriveEvalFraming(
  evalBasisLabel: string | null,
  evalBasis: string | null
): { label: string | null; description: string | null } {
  const fromLabel = (evalBasisLabel ?? "").trim();
  const prose = (evalBasis ?? "").trim();
  const detect = (s: string): "lpta" | "best_value" | null => {
    if (/lowest\s+price\s+technically\s+acceptable|\bLPTA\b/i.test(s)) return "lpta";
    if (/best[-\s]?value|trade-?off|most\s+advantageous/i.test(s)) return "best_value";
    return null;
  };
  const kind = detect(fromLabel) ?? detect(prose);
  if (kind === "lpta") {
    return {
      label: fromLabel || "LPTA",
      description: "Lowest price technically acceptable — award goes to the lowest-priced offer that meets the technical floor.",
    };
  }
  if (kind === "best_value") {
    return {
      label: fromLabel || "Best-value tradeoff",
      description: "Best-value tradeoff — technical merit and past performance are weighed against price, not lowest-price-wins.",
    };
  }
  // Unknown basis — pass the engine label through verbatim if it exists;
  // never invent a framing.
  return { label: fromLabel || null, description: null };
}

// "any curable" → CAUTION with the specific cure list. Cap at the actual
// gate count (no "all three" when length=2).
function deriveGateCardProse(
  gates: Array<{ gate_id?: string; gate_label?: string; cure_possible_in_window?: boolean }>,
  recommendation: "GO" | "CAUTION" | "DECLINE",
  daysToDeadline: number | null,
  evalFraming?: { label: string | null; description: string | null }
): { verdict_text: string; lead_text: string; count_text: string; pill_text: "BID" | "NO-BID"; outcome_win_lead: string; outcome_no_lead: string; outcome_win_tail: string; outcome_no_tail: string } {
  // FA-115 Item 5 — outcome tails reference the single derived evaluation
  // framing so §06 can never assert "LPTA win" on a best-value solicitation.
  const winTail = evalFraming?.label
    ? ` — eligible to compete under the stated basis: ${evalFraming.label}.`
    : " — eligible to compete under the solicitation's stated evaluation basis.";
  const noTail = " — no-bid this cycle. Track the next solicitation.";
  const n = gates.length;
  if (n === 0) {
    return {
      verdict_text: recommendation === "GO" ? "Bid with confidence" : recommendation === "DECLINE" ? "No-bid — bid not recommended" : "Caution — close gaps before bid",
      lead_text: "No structural gates fired on this audit. Standard scored audit applies.",
      count_text: "0 / 0 cleared",
      pill_text: recommendation === "GO" ? "BID" : "NO-BID",
      // No gates → outcome words are placeholders; .gate-card is hidden
      // when verdict_mode !== "gate", so these never render in practice.
      outcome_win_lead: "If clear ✓",
      outcome_no_lead: "If any fail ✗",
      outcome_win_tail: winTail,
      outcome_no_tail: noTail
    };
  }
  // Gate-mode prose. Pre-curability split:
  const curable = gates.filter((g) => g.cure_possible_in_window === true);
  const uncurable = gates.filter((g) => g.cure_possible_in_window !== true);
  const allUncurable = curable.length === 0;
  const allCurable = uncurable.length === 0;

  // Verdict text inside .gate-verdict (top of .gc-h). Per-gate phrasing.
  let verdictText: string;
  if (allUncurable) {
    verdictText = n === 1
      ? "NO-BID — the single gate is structurally unfixable in this window"
      : n === 2
      ? "NO-BID — both gates are structurally unfixable in this window"
      : `NO-BID — all ${n} gates are structurally unfixable in this window`;
  } else if (allCurable) {
    verdictText = n === 1
      ? "CAUTION — close the single gate before submission"
      : n === 2
      ? "CAUTION — close both gates before submission"
      : `CAUTION — close all ${n} gates before submission`;
  } else {
    verdictText = `CAUTION — ${curable.length} of ${n} curable in the response window; the rest are not`;
  }

  // Lead text (.gc-lead) — composed prose tying to the days-to-deadline math.
  const days = daysToDeadline;
  const windowPhrase = days == null
    ? "this response window"
    : days > 0
      ? `the ${days}-day window`
      : "an already-closed window";
  let leadText: string;
  if (allUncurable) {
    leadText = n === 1
      ? `The gate cannot be remedied inside ${windowPhrase} if missing today. Track the next acquisition.`
      : n === 2
      ? `Both gates close the door if either is open at submission, and neither can be remedied inside ${windowPhrase}.`
      : `All ${n} gates close the door if any is open at submission, and none can be remedied inside ${windowPhrase}.`;
  } else if (allCurable) {
    leadText = `The gate${n === 1 ? "" : "s"} can be cleared inside ${windowPhrase} — file the cure action${n === 1 ? "" : "s"} listed below before submission.`;
  } else {
    leadText = `${curable.length} of ${n} gates ${curable.length === 1 ? "is" : "are"} curable inside ${windowPhrase}; the rest are structural. Cure what you can and verify the others before quoting.`;
  }

  // Outcome lead words (E7 / F7) — drives .g-oc.win and .g-oc.no <b>...</b>
  // prefix. Renderer regex-replaces both. Never "All three" on n !== 3.
  let outcomeWin: string;
  let outcomeNo: string;
  if (n === 1) {
    outcomeWin = "If the gate clears ✓";
    outcomeNo = "If it fails ✗";
  } else if (n === 2) {
    outcomeWin = "Both ✓";
    outcomeNo = "Any ✗";
  } else if (n === 3) {
    outcomeWin = "All three ✓";
    outcomeNo = "Any ✗";
  } else {
    outcomeWin = `All ${n} ✓`;
    outcomeNo = "Any ✗";
  }

  // Count + pill — initial render state. User resolver flips pill→BID when
  // all rows are ticked.
  return {
    verdict_text: verdictText,
    lead_text: leadText,
    count_text: `0 / ${n} cleared`,
    pill_text: "NO-BID",
    outcome_win_lead: outcomeWin,
    outcome_no_lead: outcomeNo,
    outcome_win_tail: winTail,
    outcome_no_tail: noTail
  };
}

// Brain QA Item 1 (2026-06-05): VM-side projection of the engine's gates[]
// list onto the shape the masthead .mhv-gates + §06 .gate-card render.
// citation is the canonical clause reference for each gate (engine doesn't
// store one explicitly, so map by gate_id). blocker_note is shown only when
// the gate is structurally uncurable in the response window.
function deriveGateConditions(
  gates: Array<{ gate_id?: string; gate_label?: string; cure_possible_in_window?: boolean; verification_action?: string; verification_url?: string; named_entity?: string }>,
  daysToDeadline: number | null
): AuditViewModel["gate_conditions"] {
  const CITATIONS: Record<string, string> = {
    SPRS_SCORE_REQUIRED: "DFARS 252.204-7020",
    JCP_CERTIFICATION_REQUIRED: "DD Form 2345 / 252.227-7025",
    FAA_145_SPECIFIC_PNS: "14 CFR Part 145",
    TEST_JIG_APPROVAL: "Section L / specialized test",
    AFTO_ACCESS: "AFTO / TO library",
    SOLE_SOURCE_NAMED_VENDOR: "FAR 6.302"
  };
  return gates.map((g) => {
    const id = String(g.gate_id ?? "");
    const title = sanitizeDisplayText(g.gate_label || id || "Gate condition");
    // Context: named_entity if present (sole-source), else a short verification cue
    // pulled from the start of verification_action up to the first period.
    let context = "";
    if (g.named_entity) {
      context = sanitizeDisplayText(g.named_entity);
    } else if (g.verification_action) {
      const firstSentence = String(g.verification_action).split(/[.!?](?:\s|$)/)[0];
      context = sanitizeDisplayText(firstSentence.length > 110 ? firstSentence.slice(0, 108) + "…" : firstSentence);
    }
    const citation = CITATIONS[id] || "—";
    const blockerNote = g.cure_possible_in_window === false
      ? (daysToDeadline != null && daysToDeadline > 0
          ? `UNFIXABLE IN ${daysToDeadline} DAYS IF MISSING`
          : "UNFIXABLE BEFORE DEADLINE IF MISSING")
      : "";
    return { title, context, citation, blocker_note: blockerNote };
  });
}

function deriveTimelineGates(
  audit: AuditRow,
  compJson: Record<string, unknown>,
  responseDeadline: Date | null
): Array<{ date: string; label: string; status: "ok" | "warn" | "bad" }> {
  const gates: Array<{ date: string; label: string; status: "ok" | "warn" | "bad" }> = [];
  const now = Date.now();
  const parseToDate = (raw: unknown): Date | null => {
    if (typeof raw !== "string" || raw.length === 0) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  // Posted date — from the audit row column (set by route handler from SAM
  // payload) or the compliance JSON for older rows.
  const posted = parseToDate(audit.posted_date) ?? parseToDate(compJson.posted_date);
  if (posted) {
    gates.push({ date: fmtDayMonYear(posted), label: "Posted", status: "ok" });
  }
  // Q&A deadline (when extracted by the engine).
  const qaDeadline = parseToDate(audit.qa_deadline) ?? parseToDate(compJson.qa_deadline);
  if (qaDeadline) {
    gates.push({
      date: fmtDayMonYear(qaDeadline),
      label: "Q&A deadline",
      status: qaDeadline.getTime() < now ? "bad" : "warn"
    });
  }
  // Response deadline — always present when the solicitation is active.
  if (responseDeadline) {
    const days = Math.floor((responseDeadline.getTime() - now) / 86_400_000);
    const status: "ok" | "warn" | "bad" = days < 0 ? "bad" : days < 14 ? "warn" : "ok";
    gates.push({ date: fmtDayMonYear(responseDeadline), label: "Quote due", status });
  }
  // Award estimate (when extracted) — last gate in the row.
  const awardDate = parseToDate(audit.award_date) ?? parseToDate(compJson.award_date);
  if (awardDate) {
    gates.push({ date: fmtDayMonYear(awardDate), label: "Award (est.)", status: "ok" });
  }
  return gates;
}

function deriveComplianceMatrix(
  compJson: Record<string, unknown>,
  risks: Risk[],
  complianceFlags: ComplianceFlag[]
): Array<{ requirement: string; source: string; status: "action" | "risk" | "clear" }> {
  const rows: Array<{ requirement: string; source: string; status: "action" | "risk" | "clear" }> = [];
  // Build a lowercase set of citations from the risk register so clauses cited
  // there get status='risk' instead of 'clear'.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
  const riskCites = new Set(risks.map((r) => norm(r.citation || "")).filter(Boolean));
  // FA-127 — §07's "N need offeror action" rollup counts status==='action'
  // rows. Pin 'action' to the SAME renderable §04 flag set so the two
  // sections can never print contradictory counts: zero §04 flags ⇒ zero
  // 'action' rows ⇒ §07 says 0, and vice versa.
  const flagClauses = new Set(complianceFlags.map((f) => norm(f.clause)).filter(Boolean));
  const farClauses = Array.isArray(compJson.far_clauses) ? (compJson.far_clauses as string[]) : [];
  for (const c of farClauses) {
    if (!c) continue;
    rows.push({ requirement: c, source: "FAR clause", status: flagClauses.has(norm(c)) ? "action" : riskCites.has(norm(c)) ? "risk" : "clear" });
  }
  const dfarsClauses = Array.isArray(compJson.dfars_clauses) ? (compJson.dfars_clauses as string[]) : [];
  for (const c of dfarsClauses) {
    if (!c) continue;
    rows.push({ requirement: c, source: "DFARS clause", status: flagClauses.has(norm(c)) ? "action" : riskCites.has(norm(c)) ? "risk" : "clear" });
  }
  // Section L submission requirements — FA-127: non-ok items surface as
  // 'risk' (At Risk), not 'action' — 'action' is reserved for the §04 flag
  // set so the §07 offeror-action rollup has exactly one derivation source.
  const reqs = Array.isArray(compJson.submission_requirements) ? (compJson.submission_requirements as SubmissionRequirementVM[]) : [];
  for (const r of reqs) {
    if (!r.requirement) continue;
    rows.push({
      requirement: r.requirement,
      source: "Section L",
      status: r.status === "ok" ? "clear" : "risk"
    });
  }
  // Section M evaluation factors — informational, always 'clear'.
  const factors = Array.isArray(compJson.evaluation_factors) ? (compJson.evaluation_factors as EvaluationFactorVM[]) : [];
  for (const f of factors) {
    if (!f.name) continue;
    rows.push({ requirement: f.name, source: "Section M", status: "clear" });
  }
  return rows;
}

// Extract Contracting Officer email + name from Section L extraction text.
// Pattern matches the canonical "Submit to <Name>, <EMAIL>" / "<Name> at
// <EMAIL>" / "<EMAIL>" forms DLA Aviation L sections use. Returns null when
// no email is found; the caller falls back to audit.ko_email_recipient and
// then to the generic stub.
//
// Real-data example from SPRRA126Q0034 Section L:
//   "Submit to Josh E. Long, JOSH.LONG@DLA.MIL"
//   → { name: "Josh E. Long", email: "josh.long@dla.mil" }
function extractCoFromSectionL(compJson: Record<string, unknown>): { email: string; name: string | null } | null {
  // Section L surfaces the engine touches:
  //   compJson.section_l_summary (string)  — 2-3 sentence summary text
  //   compJson.submission_requirements[]   — structured requirement strings
  // Concatenate both into a single search corpus.
  const parts: string[] = [];
  if (typeof compJson.section_l_summary === "string") parts.push(compJson.section_l_summary);
  if (Array.isArray(compJson.submission_requirements)) {
    for (const r of compJson.submission_requirements as SubmissionRequirementVM[]) {
      if (r && typeof r.requirement === "string") parts.push(r.requirement);
    }
  }
  const corpus = parts.join(" \n ");
  if (!corpus) return null;
  // Email regex — DLA/DoD addresses are uppercase by convention but the
  // RFC pattern is case-insensitive. Capture group 0 = whole match.
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const emailMatch = corpus.match(emailRe);
  if (!emailMatch) return null;
  const email = emailMatch[0].toLowerCase();
  // Try to find a comma-separated name immediately before the email:
  //   "Josh E. Long, JOSH.LONG@DLA.MIL"
  //   "Submit to Mary L. Smith, MARY.SMITH@USCG.MIL"
  // Capture group 1 = the name (2-4 word title-case form).
  const namePattern = new RegExp(`([A-Z][A-Za-z]+(?:\\s+[A-Z]\\.?)?(?:\\s+[A-Z][A-Za-z]+){1,2}),\\s*${emailMatch[0].replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i");
  const nameMatch = corpus.match(namePattern);
  return { email, name: nameMatch ? nameMatch[1].trim() : null };
}

// §08 — Phase 2 #2 (Option B drafted email body, Jun 8 2026).
// Replaces the legacy "1. <risk> · 2. <risk>" run-on with a structured
// pre-quote clarification email matching the canonical §08 voice:
// greeting → lead with sol# → numbered clarification asks (questions, not
// risk dumps) → professional sign-off. Zero LLM cost. Option A (engine-side
// LLM draft) is the V2 ceiling — separate ticket.
function deriveKoEmailCard(
  audit: AuditRow,
  displayId: string,
  risks: Risk[],
  compJson: Record<string, unknown>
): { to: string; to_found: boolean; subject: string; preview: string; has_asks: boolean } {
  // FA-125 — priority order for the To field:
  //   1. CO extracted from Section L text (the canonical, doc-derived source —
  //      e.g. "Josh E. Long, JOSH.LONG@DLA.MIL" on SPRRA126Q0034)
  //   2. audit.ko_email_recipient column (set by an earlier extraction pass)
  // NO generic stub — a placeholder address invites a real send to a fake
  // mailbox. When neither source has a contact, render the truthful
  // not-found state instead.
  const lExtracted = extractCoFromSectionL(compJson);
  const extractedTo = (lExtracted?.email || (audit.ko_email_recipient as string) || "").trim();
  const to_found = extractedTo.length > 0;
  const to = to_found ? extractedTo : "CO contact not found in document — verify on SAM.gov";
  const subject = `${displayId} — Pre-quote clarifications`;

  // Greeting — "Dear [Last name]," when CO extracted; fallback to generic.
  // Use last name only (more professional than full name in a cold email).
  const coName = lExtracted?.name?.trim();
  const lastName = coName ? coName.split(/\s+/).filter((s) => /^[A-Z]/.test(s)).pop() || coName : null;
  const greeting = lastName ? `Dear ${lastName},` : "Dear Contracting Officer,";

  // Lead — anchors the email to the solicitation under review.
  const lead = `We are reviewing ${displayId} and request clarification on the following items before submission:`;

  // Numbered clarification asks — phrased as questions, not risk excerpts.
  // The canonical voice: short statement of the gap + "will the Government /
  // could the Government confirm / can the Government clarify ..."
  // W3 — only feed action-bearing, non-generic risks into the KO clarification
  // email. Pre-b1: risks.slice(0, 3) was unfiltered so a generic "initial review"
  // risk could become a clarification ask. Filter twice: (i) drop risks with no
  // real faraudit_action prose (the "stub" risks the engine emits), (ii) drop
  // risks whose title reads as a non-actionable placeholder.
  // W3-L02: exclude non-clarifiable categories from KO clarification asks.
  // L02 reverse-auction / market-structure risks are bidder strategy — not CO questions.
  const NON_CLARIFIABLE_CATEGORIES = new Set([
    'Disqualification',  // structurally ineligible — no CO ask can fix
    'pricing',           // L02 reverse-auction detector — bidder strategy
    'market-structure',  // L02 multi-vendor detector — bidder strategy
    'Manual review',     // meta-category — low-signal fallback
  ]);

  const top = risks
    .filter((r) => (r.faraudit_action || '').trim().length > 20)
    .filter((r) => !/initial review|no outstanding/i.test(r.title || ''))
    .filter((r) => !NON_CLARIFIABLE_CATEGORIES.has(r.category || ''))
    .slice(0, 3);

  // FA-125 clarifiability gate — zero substantive asks means there IS no
  // draft email. Emit the truthful no-clarifications state instead of a
  // greeting + "request clarification on the following items:" lead that
  // promises items and delivers none.
  const has_asks = top.length > 0;
  if (!has_asks) {
    return {
      to,
      to_found,
      subject,
      preview:
        "No clarification questions are required for this solicitation — the audit surfaced no items that need Contracting Officer input before submission.",
      has_asks,
    };
  }

  const body = top.map((r, i) => `${i + 1}. ${riskToClarificationAsk(r)}`).join("\n\n");

  // Sign-off — placeholders the user fills in. Matches canonical structure.
  const signoff = "Thank you for your time.\n\nRespectfully,\n[Your name]\n[Your company]";

  const preview = [greeting, "", lead, "", body, "", signoff].join("\n");
  return { to, to_found, subject, preview, has_asks };
}

// FA-106: produce clean CO-facing clarification questions from risk content.
// r.faraudit_action is internal bidder-mitigation prose (verbs like "Verify",
// URLs like https://sprs..., FARaudit-side workflow language) and must NOT
// be inverted into a CO question — that leaks internal language into the
// customer-facing email body.
// FA-125: NO shared canned suffix. Each ask carries its own risk-specific
// substance — the headline, the clause citation when present, and the first
// sentence of the document-anchored description. Identical boilerplate tails
// on every ask read as auto-generated filler to a CO.
// W3 boundary-cap retained — never mid-word slice into the headline.
function riskToClarificationAsk(r: Risk): string {
  const title = (r.title || "").trim();
  const headline = title
    ? (title.split(/[.!?;:]\s+|\s+—\s+/)[0].trim() || title)
    : "A risk was identified";
  const cite = (r.citation || "").trim();
  const anchor = cite && !headline.includes(cite) ? `${headline} (${cite})` : headline;
  const desc = (r.description || "").trim();
  const descSentence = desc
    ? (desc.split(/(?<=[.!?])\s+/)[0] || "").trim().slice(0, 220)
    : "";
  return descSentence && descSentence.toLowerCase() !== headline.toLowerCase()
    ? `${anchor} — ${descSentence}`
    : anchor;
}

// Brain ruling Item 3 (2026-06-05): severity recalibration. The prior mapping
// derived severity from r.status (todo→dq, warn→req, ok→adv), which inverted
// real-world semantics — JCP gaps came in as REQ when they're disqualifying,
// while a CAGE code requirement came in as DQ when it's just required.
//
// New mapping is CONTENT-DRIVEN, not status-driven:
//
//   DQ ONLY:
//     - JCP gap                         → can't bid without it
//     - SPRS absent                     → can't bid without it
//     - email-only submission violated  → quote thrown out at intake
//     - proposal not in English/USD     → quote thrown out at intake
//   Hard rule: never more than 3 DQ tags on a single audit. If detection
//   overshoots, downgrade the lowest-priority surplus DQs to REQ.
//
//   REQ:
//     - CAGE code on proposals
//     - Container price breakout
//     - MFG name + P/N
//     - SAM registration
//     - Reps & certs
//     - Product literature
//
//   ADV:
//     - Source selection legend
//     - DPAS acknowledgment
//     - HUBZone preference waiver
//
//   DEFAULT: anything not matched above → REQ (conservative middle).

const DQ_PATTERNS: RegExp[] = [
  /\bJCP\b|Joint\s+Certification\s+Program/i,
  /\bSPRS\b|Supplier\s+Performance\s+Risk|NIST\s*SP\s*800-171\s+(?:Basic\s+)?Assessment/i,
  /email[-\s]?only|by\s+e[-\s]?mail\s+only/i,
  /\b(?:English\s+(?:language|only)|U\.S\.\s+dollars?|USD\s+only)\b/i
];
const ADV_PATTERNS: RegExp[] = [
  /source\s+selection\s+(?:legend|sensitive)/i,
  /\bDPAS\b/i,
  /HUBZone\s+(?:preference\s+)?waiver/i
];

function classifyChecklistSeverity(text: string): "dq" | "req" | "adv" {
  if (DQ_PATTERNS.some((p) => p.test(text))) return "dq";
  if (ADV_PATTERNS.some((p) => p.test(text))) return "adv";
  return "req";
}

// §09 — Phase 2 #1 (F1) — six-bucket deterministic categorization, Jun 8 2026.
// Replaces the legacy 3-bucket (before/with/after) derivation. Buckets +
// regex patterns mirror src/lib/section-extractors.ts:316 so V1 derives the
// same shape V2 emits. Critical buckets get .is-critical styling client-side.
type ChecklistBucket = "deadline" | "registration" | "mandatory_doc" | "representation" | "format" | "other";
const CHECKLIST_BUCKET_ORDER: ChecklistBucket[] = ["deadline", "registration", "mandatory_doc", "representation", "format", "other"];
const CHECKLIST_BUCKET_LABEL: Record<ChecklistBucket, string> = {
  deadline: "Submission deadline",
  registration: "Registrations & status",
  mandatory_doc: "Mandatory documents",
  representation: "Representations & certifications",
  format: "Format & content",
  other: "Other",
};
const CHECKLIST_CRITICAL_BUCKETS = new Set<ChecklistBucket>(["deadline", "registration", "mandatory_doc"]);

function categorizeChecklistBucket(text: string): ChecklistBucket {
  // FA-115 Pass 4 Item 6 — Q&A items are checked FIRST so "Questions are due
  // no later than…" never lands in (and mislabels) the SUBMISSION DEADLINE
  // bucket. Q&A/inquiry deadlines are reference info, not the submit-by gate.
  if (/\bquestions?\b|\bq\s*&\s*a\b|\binquir/i.test(text)) return "other";
  // Submission deadline — covers "Submit quote by …", "Quotes due …",
  // "Offers are due …", "Proposal due date", plus the generic deadline forms.
  // `submit\s+(?:\w+\s+){0,3}by` tolerates the object between verb and "by"
  // ("Submit quote by", "Submit your proposal package by").
  if (/submit\s+(?:\w+\s+){0,3}by\b|(?:quotes?|offers?|proposals?|responses?)\s+(?:are\s+|is\s+)?due|due\s+(date|time)|no\s+later\s+than|close\s+of\s+business|deadline/i.test(text)) return "deadline";
  if (/\bSAM\.gov|System\s+for\s+Award\s+Management|\bWAWF\b|\bregister/i.test(text)) return "registration";
  if (/must\s+include|shall\s+include|required\s+to\s+(submit|provide)|MFG\s+name|Part\s+Number|breakdown|CAGE\s+code/i.test(text)) return "mandatory_doc";
  if (/\brepresentation|certification|\bcertif/i.test(text)) return "representation";
  if (/english\s+language|U\.?S\.?\s+Currency|\bUSD\b|via\s+email|page\s+limit|font|format/i.test(text)) return "format";
  return "other";
}

// §03 — Phase 2 #3 (Jun 8 2026). Floor: always emit one of work_statement /
// work_statement_unknown so §03 never silently loses the reveal block.
//
// Trigger:
//   - document_type ∈ {SOW, PWS, SOO, combined} → known block. Low confidence
//     stays in known with a "Tentative" chip (do NOT fall to unknown).
//   - everything else (RFP / RFQ / IFB / Sources Sought / Other / null /
//     empty) → amber honest-unknown variant. Reads as rigor, not a bug.
//
// Ceiling (V2 — future ticket): real SOW/PWS/SOO classification from
// attachment parsing. The V1 engine classifies the WHOLE document, not the
// work-statement type embedded within it, so most real audits today go to
// the unknown variant.
const WS_KNOWN_TYPES = new Set(["SOW", "PWS", "SOO", "combined"]);
const WS_FULL: Record<string, string> = {
  SOW: "Statement of Work",
  PWS: "Performance Work Statement",
  SOO: "Statement of Objectives",
  combined: "Combined work statement",
};
const WS_MEANING: Record<string, string> = {
  SOW: "Government prescribes the work — propose a <b>method</b> for executing each listed deliverable. Pricing follows the scope's structure.",
  PWS: "Government states <b>performance standards</b>, not methods — propose your approach to meeting them. Method is your trade space; outcomes are graded against the standards.",
  SOO: "Government states <b>objectives</b> — you define how to achieve them. Highest creative latitude; bid clarity wins.",
  combined: "Mixed posture — different sections governed by SOW / PWS / SOO. Handle each under its native rule.",
};
const WS_BID_STRATEGY: Record<string, string> = {
  SOW: "Lead with <b>method depth</b> per deliverable. Tie each priced CLIN to a discrete SOW item so the Government can map your approach 1:1 to the scope.",
  PWS: "Lead with <b>outcome confidence</b> — show evidence you've hit comparable performance standards before. Method is supporting, not central.",
  SOO: "Lead with <b>creative differentiation</b> — your proposed means are the differentiator. Anchor every choice to a stated objective.",
  combined: "Map each section's posture in your response outline so the Government sees you've matched their rule per section.",
};

function deriveWorkStatementReveal(audit: AuditRow): {
  work_statement: AuditViewModel["work_statement"];
  work_statement_unknown: AuditViewModel["work_statement_unknown"];
} {
  const docType = String(audit.document_type ?? "").trim();
  const confRaw = String(audit.document_type_confidence ?? "low").toLowerCase();
  const rationale = String(audit.document_type_rationale ?? "").trim();

  if (WS_KNOWN_TYPES.has(docType)) {
    const confLabel: "High confidence" | "Medium confidence" | "Tentative" =
      confRaw === "high" ? "High confidence" : confRaw === "medium" ? "Medium confidence" : "Tentative";
    return {
      work_statement: {
        abbr: docType as "SOW" | "PWS" | "SOO" | "combined",
        full: WS_FULL[docType],
        meaning: WS_MEANING[docType],
        evidence: rationale || "Classification derived from the document header + structural analysis (Section labels, deliverable vs performance-standard language).",
        confidence: confLabel,
        bid_strategy: WS_BID_STRATEGY[docType],
      },
      work_statement_unknown: null,
    };
  }

  // Unknown amber variant — fires on RFP/RFQ/IFB/Other/null. Reads as rigor.
  return {
    work_statement: null,
    work_statement_unknown: {
      head: "Work-statement type not classified from the parsed body",
      reason:
        "The governing work statement (SOW / PWS / SOO) wasn't located in the body FARaudit parsed for this notice. It likely lives in an <b>attachment</b> — a separate SOW PDF, a §C narrative document, or a CDRL/DID supplement that isn't part of the main solicitation file. SOW vs PWS changes your entire bid posture (method-led vs outcome-led), so FARaudit reports this as <b>tentative</b> rather than guessing.",
      action: "<b>Upload the SOW/PWS attachment to classify it.</b> The work-statement type is the single highest-leverage call in your bid strategy — it decides whether you propose a method (SOW) or propose to outcomes (PWS/SOO).",
    },
  };
}

function deriveSubmissionChecklistFiltered(
  compJson: Record<string, unknown>
): AuditViewModel["submission_checklist_filtered"] {
  // Source: prefer raw[] (engine emits this), fall back to objects[].
  const reqsRaw = Array.isArray(compJson.submission_requirements_raw) ? (compJson.submission_requirements_raw as unknown[]) : null;
  const reqsObj = Array.isArray(compJson.submission_requirements) ? (compJson.submission_requirements as SubmissionRequirementVM[]) : null;
  const lines: string[] = reqsRaw
    ? reqsRaw.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : reqsObj
    ? reqsObj.map((r) => (r.requirement || "").trim()).filter((s) => s.length > 0)
    : [];

  // Dedup by punctuation-stripped fingerprint — kills the "duplicated run-on"
  // F1 symptom where the same risk title appears twice.
  const seen = new Set<string>();
  type Item = AuditViewModel["submission_checklist_filtered"][number]["items"][number];
  const items: Item[] = [];
  for (const line of lines) {
    const fp = line.toLowerCase().replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim();
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    const bucket = categorizeChecklistBucket(line);
    items.push({
      bucket,
      text: line,
      source: "Section L",
      isCritical: CHECKLIST_CRITICAL_BUCKETS.has(bucket),
      complete: false,
    });
  }

  // Group in canonical order, drop empty buckets so the §09 counter math
  // (rendered .ck-item count) stays honest. Critical flag is DATA-driven.
  return CHECKLIST_BUCKET_ORDER.map((b) => ({
    bucket: b,
    label: CHECKLIST_BUCKET_LABEL[b],
    critical: CHECKLIST_CRITICAL_BUCKETS.has(b),
    items: items.filter((it) => it.bucket === b),
  })).filter((g) => g.items.length > 0);
}

// ─── main ───────────────────────────────────────────────────────────────────

export function buildViewModel(audit: AuditRow, opts?: { isWatching?: boolean; hasCapabilityStatement?: boolean }): AuditViewModel {
  // FA-115 (Pass 4 Item 1): prefer audit.solicitation_number (DB column,
  // deterministic SAM-sourced) over compJson.solicitation_number_canonical
  // (LLM-extracted from SF-18/1449 cover page). The LLM occasionally
  // concatenates the SOL number with the first CLIN code ("FA480026Q0061" +
  // "0001" → "FA480026Q00610001"). The DB column is clean. Canonical remains
  // fallback when the DB column is null. No regex trimming heuristics — we
  // trust the cleaner source.
  const compJsonEarly = (audit.compliance_json as Record<string, unknown> | null) || {};
  // V2 cutover B2 — surface lengths fed to stripHideWhenEmptyBlocks so the
  // strip skips l02_catches / confidence_notes when V2 overlay will populate.
  const v2Shadow = (compJsonEarly.v2_shadow as Record<string, unknown> | null) ?? null;
  const v2SurfacesObj = (v2Shadow?.surfaces as Record<string, unknown> | undefined) ?? {};
  // FA-110/111: surface V2 metadata_brief for masthead consumption (set_aside/agency/naics)
  const v2Meta = (v2SurfacesObj.metadata_brief as Record<string, unknown> | null) ?? null;
  const v2SurfaceLengths = {
    l02_catches: Array.isArray(v2SurfacesObj.l02_catches) ? (v2SurfacesObj.l02_catches as unknown[]).length : 0,
    // FA-139: count POST-suppression so .confidence_count and the strip
    // gate agree with the rows buildV2ViewModelFromShadow actually renders.
    confidence_notes: Array.isArray(v2SurfacesObj.confidence_notes)
      ? suppressContradictedConfidenceNotes(
          v2SurfacesObj.confidence_notes as AuditConfidenceNote[],
          audit as unknown as Record<string, unknown>
        ).length
      : 0,
  };
  const canonicalSol = (compJsonEarly.solicitation_number_canonical as string | null | undefined) ?? null;
  const dbSol = audit.solicitation_number as string | null | undefined;
  const displayId = displaySolicitationId({
    solicitation_number: (typeof dbSol === "string" && dbSol.trim().length > 0) ? dbSol : canonicalSol,
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
  // Fix 2 (2026-06-05 — Ruling 1 wiring): read the typed verdict the engine
  // persisted to complianceJson.verdict. When DECISION_GATE, suppress the
  // numeric fit_score (set to null per spec) and tag verdict_mode='gate' so
  // the renderer can switch to the interactive gate template. Gate audits
  // are NOT unscored (they made a decision) — keep isUnscored false here.
  const persistedVerdict = (compJson.verdict as { type?: string } | undefined);
  const verdictMode: "gate" | "scored" = persistedVerdict?.type === "DECISION_GATE" ? "gate" : "scored";
  // FA-108: soft lock when caller signals no capability_statement on file.
  // undefined → false (no lock). Explicit false → lock. Wired via opts in a
  // follow-up commit; today no caller passes the flag so behavior is inert.
  const score_locked: boolean = opts?.hasCapabilityStatement === false;

  // Honesty flags from audit-engine 13f4743+. compliance_score is now
  // number | null; score_confidence + is_not_solicitation are written into
  // compliance_json by the engine. Pre-13f4743 rows won't have them: derive
  // is_not_solicitation from doc-type + clause counts, and treat compliance_
  // score === null as the source of truth for "unscored".
  const rawScore: number | null = typeof audit.compliance_score === "number"
    ? (audit.compliance_score as number)
    : null;
  // Gate verdicts emit fit_score=null per Ruling 1 spec — renderer shows "—"
  // instead of the underlying numeric. Non-gate verdicts pass through.
  // FA-108: score also nulled when score_locked (no capability_statement on file).
  const score: number | null = (verdictMode === "gate" || score_locked) ? null : rawScore;
  const scoreConfidenceRaw = (compJson.score_confidence ?? audit.score_confidence) as string | undefined;
  // Gate audits ran on a real source and produced a decision — not unscored.
  // The unscored branch only fires when the engine literally couldn't score
  // (metadata-only, no PDF).
  const isUnscored = verdictMode !== "gate" && (rawScore === null || scoreConfidenceRaw === "unscored");
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
  // Phase 2 #4 (Jun 8 2026): qa_deadline + award_date now parsed from the
  // audit row (with compJson fallback — same path the timeline gates use at
  // lines 1194/1209). Renderer drops each .kd-item when its has_* is false;
  // .urgent + award_quarter computed off one fixed `now` for determinism.
  const now = new Date();
  const responseDeadline = parseDate(audit.response_deadline);
  const responseDays = responseDeadline ? daysBetween(now, responseDeadline) : null;
  // FA-107: solicitation is closed when offer-due deadline is in the past
  const is_expired: boolean = responseDays !== null && responseDays < 0;
  // (FA-108 score_locked is declared earlier near verdictMode — needs to be in
  // scope by the time `score` is computed.)
  const qaDeadlineDate = parseDate(audit.qa_deadline) ?? parseDate(compJson.qa_deadline);
  const qaDays = qaDeadlineDate ? daysBetween(now, qaDeadlineDate) : null;
  const awardDateDate = parseDate(audit.award_date) ?? parseDate(compJson.award_date);
  const awardQuarterStr = fiscalQuarter(awardDateDate);
  // Compute `.urgent` — the single soonest UPCOMING date wins (min positive
  // countdown). If Questions-due has passed, urgent moves to Quote-due, etc.
  // Empty string when no upcoming date exists → renderer adds no .urgent class.
  const upcoming: Array<{ field: "qa_deadline" | "response_deadline" | "award_date"; days: number }> = [];
  if (qaDays != null && qaDays >= 0) upcoming.push({ field: "qa_deadline", days: qaDays });
  if (responseDays != null && responseDays >= 0) upcoming.push({ field: "response_deadline", days: responseDays });
  // award_date counts even though it's typically months out — if it's the only
  // future date, it still gets the amber accent.
  const awardDays = awardDateDate ? daysBetween(now, awardDateDate) : null;
  if (awardDays != null && awardDays >= 0) upcoming.push({ field: "award_date", days: awardDays });
  upcoming.sort((a, b) => a.days - b.days);
  const urgentField: "" | "qa_deadline" | "response_deadline" | "award_date" =
    upcoming.length > 0 ? upcoming[0].field : "";

  // Cycle-1 canonical gate detection (Brain ruling 2026-06-06). Fact-layer
  // determinism fix: gates are detected by the VM scanning the full stored
  // corpus, not read from compJson.verdict.gates (which is the non-deterministic
  // engine output). Same signal across all extraction runs → byte-stable
  // gate_conditions + gate_card.
  const canonicalDaysToDeadline = responseDeadline
    ? Math.floor((responseDeadline.getTime() - now.getTime()) / 86_400_000)
    : null;
  const canonicalGateCorpus = buildGateCorpus(audit, compJson, risksJson, overviewJson);
  const canonicalGates = detectGatesCanonical(canonicalGateCorpus, canonicalDaysToDeadline);

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
  // FA-115 Item 5 — single-source evaluation framing. The derived label feeds
  // BOTH the §M head pill (eval_basis_label) and the §06 gate-outcome tails
  // (via deriveGateCardProse) so the two surfaces can never diverge again.
  const evalFraming = deriveEvalFraming(
    (compJson.eval_basis_label ?? null) as string | null,
    evalBasis
  );
  const evalBasisLabel = evalFraming.label;
  // Defect 4 (2026-06-05): sanitize every rendered text field on §M factors
  // and §L requirements. Engine emits these from Call 1 (Overview) where the
  // prompt can land raw ISO timestamps in factor.note / requirement strings.
  const evaluationFactors: EvaluationFactorVM[] = Array.isArray(compJson.evaluation_factors)
    ? (compJson.evaluation_factors as EvaluationFactorVM[]).map((f) => ({
        ...f,
        name: sanitizeDisplayText(f.name),
        importance: sanitizeDisplayText(f.importance),
        coverage: sanitizeDisplayText(f.coverage),
        note: sanitizeDisplayText(f.note)
      }))
    : [];
  const submissionRequirements: SubmissionRequirementVM[] = Array.isArray(compJson.submission_requirements)
    ? (compJson.submission_requirements as SubmissionRequirementVM[]).map((r) => ({
        ...r,
        requirement: sanitizeDisplayText(r.requirement)
      }))
    : [];
  const submissionSummary = (compJson.submission_summary ?? null) as string | null;

  // KO email — FA-102: single derivation. Path B retired; deriveKoEmailCard's
  // §05 (Section L) extraction is canonical for ko_email.to on every surface.
  // FA-125 — ONE generator. The §08 card preview and the drawer body used to
  // come from two different derivations (deriveKoEmailCard vs deriveKoBody)
  // and printed two different emails in the same report. The drawer body is
  // now the card's text verbatim.
  const koCard = deriveKoEmailCard(audit, displayId, risks, compJson);
  const koTo = koCard.to;
  const koBody = koCard.preview;

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
        ? "No-bid — bid not recommended"
        : "Caution → close gaps before bid";
  const taglineForUnscored = "Upload the PDF to get a full audit score.";

  return {
    solicitation_number: displayId,
    audit_id_short: String(audit.id ?? "").slice(0, 8),
    audit_id_full: String(audit.id ?? ""),
    generated_at: fmtStamp(parseDate(audit.completed_at ?? audit.created_at)),
    page_title: `FARaudit — Audit Report · ${displayId}`,

    title,
    agency: (v2Meta?.agency as string | undefined) || (audit.agency as string) || "—",
    agency_sub: "",
    naics: (v2Meta?.naics_code as string | undefined) || (audit.naics_code as string) || "—",
    naics_sub: "",
    // Defect 2 (2026-06-05): prefer the engine-computed set-aside (derived
    // from doc text via applySetAsideRegex) over the SAM-sourced audits.set_aside
    // column. Doc text overrides metadata — masthead must show what the
    // solicitation actually says.
    set_aside: normalizeSetAside(
      (v2Meta?.set_aside as string | undefined)
        ?? (compJson.set_aside_type as string | undefined)
        ?? (audit.set_aside as string | undefined)
    ),
    set_aside_sub: "",
    contract_type: sanitizeDisplayText(overviewJson.contract_type) || "—",
    // P2 polish: the masthead cell sub-line is a compact label slot, not a
    // prose field. period_of_performance often arrives as a full sentence
    // ("Delivery required on or before 31 OCT 2026; offers must be held
    // firm…") or a not-stated disclaimer — neither belongs under "FFP".
    // Show it only when it reads like a compact PoP value.
    contract_type_sub: ((): string => {
      const pop = sanitizeDisplayText(overviewJson.period_of_performance);
      if (!pop || pop.length > 60) return "";
      if (/not (?:explicitly )?stated|not extracted|no verbatim|not specified/i.test(pop)) return "";
      return pop;
    })(),

    recommendation: verdict.word,
    recommendation_class: verdict.cls,
    recommendation_tagline: isUnscored
      ? taglineForUnscored
      : verdictTagline(verdict.word, sanitizeDisplayText(audit.bid_recommendation as string) || ""),
    recommendation_pill_text: recommendationPill,
    score,
    score_display: score == null ? "—" : String(Math.round(score)),
    is_unscored: isUnscored,
    is_not_solicitation: isNotSolicitation,
    verdict_mode: verdictMode,
    // Cycle-1 canonical gate conditions — sourced from canonicalGates (VM-side
    // corpus scan), not compJson.verdict.gates. Same gates fire across all
    // extraction runs when the underlying signal is in any stored field.
    gate_conditions: deriveGateConditions(canonicalGates, canonicalDaysToDeadline),
    gate_pearl: null,

    // ─── Fork 3 surfaces (2026-06-05) — derived from existing engine output ──
    // exec_*: engine-emitted (complianceJson.executive_summary) when available.
    // The fallback path runs when the row was written by pre-Fork-3 engine
    // code — we derive the same shape from existing fields so legacy rows
    // still render the Exec Summary surface cleanly.
    exec_verdict: (() => {
      const eng = compJson.executive_summary as { verdict?: string } | undefined;
      return eng?.verdict ?? (verdict.word === "GO" ? "GO" : verdict.word === "DECLINE" ? "NO-BID" : "CAUTION");
    })(),
    exec_what: (() => {
      const eng = compJson.executive_summary as { what?: string } | undefined;
      if (eng?.what) return sanitizeDisplayText(eng.what);
      const overviewJson = (compJson.overview ?? {}) as { summary?: string };
      const summary = String(overviewJson.summary ?? audit.overview_summary ?? "").trim();
      const firstSentence = summary.split(/[.!?](?:\s|$)/)[0] || summary;
      return sanitizeDisplayText(firstSentence.length > 160 ? `${firstSentence.slice(0, 158).trimEnd()}…` : firstSentence);
    })(),
    exec_factors: (() => {
      const eng = compJson.executive_summary as { factors?: unknown } | undefined;
      if (Array.isArray(eng?.factors)) return (eng.factors as unknown[]).map((f) => sanitizeDisplayText(String(f)));
      return risks.slice(0, 3).map((r) => sanitizeDisplayText(r.title || r.description.slice(0, 100)));
    })(),
    exec_actions: (() => {
      // FA-114: clamp generated action dates against responseDeadline. Engine
      // can emit "By 11 Jun" strings that exceed the deadline; the VM-derived
      // fallback can also overshoot when risks.length > days_remaining. In
      // either case the "By <date>" prefix is dropped so the action text
      // stands alone. Applies in ALL modes — not only is_expired.
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const monIdx: Record<string, number> = {
        jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
      };
      // Robust parser — JS's Date(string) is unreliable for short formats like
      // "11 Jun 2026". Manually parse "By D Mon" / "By Mon D" / ISO formats.
      const parseWhen = (when: string): Date | null => {
        if (!when) return null;
        const stripped = when.replace(/^By\s+/i, "").trim();
        // ISO-ish: 2026-06-11 or 2026-06-11T...
        const iso = stripped.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
        // Day Mon  ("11 Jun")  or  Mon Day  ("Jun 11")  — with optional year
        const parts = stripped.split(/[\s,]+/).filter(Boolean);
        let day: number | null = null;
        let mon: number | null = null;
        let yearTok: number | null = null;
        for (const p of parts) {
          const n = parseInt(p, 10);
          if (!isNaN(n)) {
            if (n >= 1 && n <= 31 && day === null) day = n;
            else if (n >= 2020 && n <= 2099) yearTok = n;
          } else {
            const m = monIdx[p.slice(0, 3).toLowerCase()];
            if (m !== undefined && mon === null) mon = m;
          }
        }
        if (day === null || mon === null) return null;
        const year = yearTok ?? new Date().getUTCFullYear();
        return new Date(Date.UTC(year, mon, day));
      };
      const clampWhen = (when: string): string => {
        if (!when || !responseDeadline) return when;
        const d = parseWhen(when);
        return d && d > responseDeadline ? "" : when;
      };
      const eng = compJson.executive_summary as { actions?: unknown } | undefined;
      if (Array.isArray(eng?.actions)) {
        return (eng.actions as Array<{ when?: unknown; text?: unknown }>).map((a) => ({
          when: clampWhen(sanitizeDisplayText(String(a.when ?? ""))),
          text: sanitizeDisplayText(String(a.text ?? ""))
        }));
      }
      return risks.slice(0, 3).map((r, i) => {
        const d = new Date(Date.now() + (i + 1) * 86_400_000);
        const past = responseDeadline && d > responseDeadline;
        return {
          when: past ? "" : `By ${d.getUTCDate()} ${months[d.getUTCMonth()]}`,
          text: sanitizeDisplayText(r.faraudit_action || r.title || r.description.slice(0, 160))
        };
      });
    })(),
    exec_class: deriveExecClass(verdict.word),

    timeline_gates: deriveTimelineGates(audit, compJson, responseDeadline),

    compliance_matrix: deriveComplianceMatrix(compJson, risks, complianceFlags),
    matrix_export_url: `/api/audit/${audit.id}/matrix.pdf`,

    ko_email: koCard,

    submission_checklist_filtered: deriveSubmissionChecklistFiltered(compJson),
    ...deriveWorkStatementReveal(audit),

    has_incumbent: incumbentHasData,
    incumbent_none_head: "No incumbent identified",
    incumbent_none_note: "No prior award was found for this NSN / solicitation pattern. Either this is a first-time procurement, or the historical record isn't in our corpus yet. Confirm the recompete cycle directly with the contracting officer.",

    // Canonicalization layer (Brain ruling 2026-06-06) — single-source verdict
    // + canonical gate prose tied to actual gate count + days-to-deadline.
    verdict_word: (() => {
      // FA-126 — the stored audits.recommendation column is the single
      // source of truth (same field the ledger, masthead pill, and PDF
      // read). compJson.verdict.recommendation is fallback only, for legacy
      // rows written before the column was populated.
      const v = (compJson.verdict ?? null) as { recommendation?: string } | null;
      const rec = (audit.recommendation as string | undefined) ?? v?.recommendation ?? "";
      if (rec === "PROCEED") return "BID";
      if (rec === "DECLINE") return "NO-BID";
      return "CAUTION";
    })(),
    days_to_deadline: canonicalDaysToDeadline,
    // Cycle-1 canonical gate card — composed from canonicalGates (VM-detected),
    // not compJson.verdict.gates. Byte-stable across extraction-variant runs.
    gate_card: deriveGateCardProse(canonicalGates, verdict.word, canonicalDaysToDeadline, evalFraming),
    // ─────────────────────────────────────────────────────────────────────
    win_probability: wp,
    win_probability_benchmark: wpBenchmark,
    // Engine-computed (null when score <60) — drives the renderer's
    // hide-when-null gate on .mhv-bench.
    score_benchmark: (compJson.score_benchmark as string | null | undefined) ?? null,

    qa_deadline: qaDeadlineDate ? fmtDayMonYear(qaDeadlineDate) : "",
    qa_days: fmtKdCountdown(qaDays),
    qa_days_num: qaDays != null ? String(Math.max(0, qaDays)) : "",
    response_deadline: fmtDayMonYear(responseDeadline),
    response_days: fmtKdCountdown(responseDays),
    response_days_num: responseDays != null ? String(Math.max(0, responseDays)) : "",
    response_deadline_short: fmtDueShort(responseDeadline),
    award_date: awardDateDate ? fmtDayMonYear(awardDateDate) : "",
    award_quarter: awardQuarterStr,
    urgent_field: urgentField,
    key_dates_note: "",
    has_response_deadline: !!responseDeadline,
    has_qa_deadline: !!qaDeadlineDate,
    has_award_date: !!awardDateDate,
    has_award_quarter: awardQuarterStr.length > 0,
    is_expired,
    score_locked,
    v2_surface_lengths: v2SurfaceLengths,

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
