// Component 6 — VM Normalizers (Cycle 2)
//
// Pure functions that take raw ExtractedFacts + AuditJudgment and produce
// view-model shapes that feed the audit report template directly.
//
// Brain Q5 ruling preserved: dedup removes duplicates only — NO HARD CAP.
// Brain Q3 ruling preserved: submission checklist has 6 buckets + catch-all,
// no requirement may render with undefined status.
// Brain Q4 ruling preserved: §04 flags pulled from risk_findings filtered
// to offerorActionRequired; empty → hide, all-inferred → render-with-marker.

import type { ExtractedFacts, ClauseItem } from "../../../lib/section-extractors";
import type { AuditRisk, AuditJudgment } from "../../../lib/audit-judgment";

// ───────────────────────────────────────────────────────────────────────────
// workStatement — §03-HEAD reveal (Cycle 2 v2)
// Returns EXACTLY ONE of:
//   { work_statement }          when documentClassification.type ∈ {SOW,PWS,SOO,combined}
//   { work_statement_unknown }  when documentClassification.type === 'unknown'
// Renderer uses the presence of each key to pick the data-state="known" vs
// data-state="unknown" block. Never hide — the unknown variant reads as
// rigor (Condition 1 fail-loud).
// Per Brain REV2: unknown variant fires ONLY on type === 'unknown'. A
// low-confidence-but-KNOWN type renders the known block with a "Tentative"
// confidence chip.
// ───────────────────────────────────────────────────────────────────────────

const TYPE_FULL: Record<string, string> = {
  SOW: "Statement of Work",
  PWS: "Performance Work Statement",
  SOO: "Statement of Objectives",
  combined: "Combined (SOW + PWS)",
};

const TYPE_MEANING: Record<string, string> = {
  SOW: "The Government prescribes <b>how</b> the work is done — tasks, methods, and deliverables are spelled out. You are scored on <b>compliance with the stated method</b>, not on a process you invent. This is the most prescriptive and leaves the least room to differentiate on approach.",
  PWS: "The Government specifies <b>outcomes and performance standards</b>, leaving methodology to the contractor. You are scored on the strength of your approach and your track record. This rewards demonstrated capability and clean past performance.",
  SOO: "The Government states <b>objectives only</b> and asks the offeror to propose the full approach. The technical volume IS the proposal — methodology is your primary differentiator.",
  combined: "Hybrid — parts of the work are SOW (prescribed methods), other parts PWS (outcomes-based). Read each section carefully; the bid strategy varies CLIN by CLIN.",
};

export type WorkStatementKnown = {
  abbr: "SOW" | "PWS" | "SOO" | "combined";
  full: string;
  meaning: string;
  evidence: string;
  confidence: "High confidence" | "Medium confidence" | "Tentative";
  bid_strategy: string;
};

export type WorkStatementUnknown = {
  head: string;
  reason: string;
  action: string;
};

export interface WorkStatementResult {
  work_statement: WorkStatementKnown | null;
  work_statement_unknown: WorkStatementUnknown | null;
}

function confidenceLabel(conf: AuditJudgment["documentClassification"]["confidence"]): WorkStatementKnown["confidence"] {
  if (conf === "high") return "High confidence";
  if (conf === "medium") return "Medium confidence";
  return "Tentative";
}

export function workStatement(dc: AuditJudgment["documentClassification"]): WorkStatementResult {
  if (dc.type === "unknown") {
    return {
      work_statement: null,
      work_statement_unknown: {
        head: "Couldn't confirm from the extracted text",
        reason:
          dc.evidence ||
          "The governing work statement appears to live in an <b>attachment</b> (a Statement of Need / SOW PDF) that wasn't in the parsed solicitation body. SOW vs PWS changes the entire bid approach, so FARaudit reports this as tentative rather than guessing.",
        action:
          "<b>Upload the attachment to resolve this.</b> It's the single highest-leverage line in the audit — it decides whether you propose a method (SOW) or propose to outcomes (PWS/SOO).",
      },
    };
  }
  if (dc.type === "wrong_doc") {
    // Unreachable in practice — runAuditV2's pre-extraction detector short-
    // circuits and synthesizes work_statement/work_statement_unknown=null
    // directly without calling this function. Branch kept for type-safety.
    return { work_statement: null, work_statement_unknown: null };
  }
  return {
    work_statement: {
      abbr: dc.type,
      full: TYPE_FULL[dc.type] ?? dc.type,
      meaning: TYPE_MEANING[dc.type] ?? "",
      evidence: dc.evidence || "(evidence not captured)",
      confidence: confidenceLabel(dc.confidence),
      bid_strategy: dc.bidStrategy || "(bid strategy not captured)",
    },
    work_statement_unknown: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// matrix_rollup — collapse standard clauses into a rollup row, preserve traps
// and §L/§M-referenced clauses as individual rows.
// ───────────────────────────────────────────────────────────────────────────

export type MatrixBadge = "trap" | "required" | "reference" | "rollup";

export interface ClauseMatrixRow {
  number: string;
  title: string;
  badge: MatrixBadge;
  trapReason: string | null;
}

export function matrixRollup(clauses: ClauseItem[]): ClauseMatrixRow[] {
  // Legacy flat-row return — preserved for callers that still consume the
  // single-array shape. NEW callers should prefer matrixRollupReshape (below)
  // which returns { required, reference, reference_count } per Cycle 2 v2.
  const reshaped = matrixRollupReshape(clauses);
  const out: ClauseMatrixRow[] = [...reshaped.required];
  if (reshaped.reference_count > 6) {
    const farCount = reshaped.reference.filter((c) => c.number.startsWith("52.")).length;
    const dfarsCount = reshaped.reference.filter((c) => c.number.startsWith("252.")).length;
    const otherCount = reshaped.reference_count - farCount - dfarsCount;
    const parts: string[] = [];
    if (farCount > 0) parts.push(`${farCount} FAR`);
    if (dfarsCount > 0) parts.push(`${dfarsCount} DFARS`);
    if (otherCount > 0) parts.push(`${otherCount} other`);
    out.push({
      number: `(${reshaped.reference_count} total)`,
      title: `${parts.join(" + ")} standard clauses incorporated by reference`,
      badge: "rollup",
      trapReason: null,
    });
  } else {
    for (const c of reshaped.reference) out.push(c);
  }
  return out;
}

// matrixRollupReshape — Cycle 2 v2 §04 reshape per Design spec.
// Returns: { required, reference, reference_count }
//   required  = traps + full-text (the rich .cmx-row cards above the rollup)
//   reference = by-reference tail (rendered as .cmx-ref chips inside the
//               .cmx-rollup collapsible)
//   reference_count = number rendered as <b> in the rollup toggle label
// Renderer-side derived counts (NOT hardcoded literals — Part D anti-literal
// binding):
//   trap_count     = required.filter(r => r.badge === "trap").length
//   fulltext_count = required.filter(r => r.badge === "required").length
export interface MatrixRollupReshaped {
  required: ClauseMatrixRow[];
  reference: ClauseMatrixRow[];
  reference_count: number;
}

export function matrixRollupReshape(clauses: ClauseItem[]): MatrixRollupReshaped {
  if (clauses.length === 0) {
    return { required: [], reference: [], reference_count: 0 };
  }
  const traps = clauses.filter((c) => c.isTrap);
  const fullText = clauses.filter((c) => !c.isTrap && c.incorporated === "full_text");
  const byRef = clauses.filter((c) => !c.isTrap && c.incorporated === "by_reference");

  const required: ClauseMatrixRow[] = [
    ...traps.map((c) => ({
      number: c.number,
      title: c.title || "(title not extracted — verify in solicitation)",
      badge: "trap" as const,
      trapReason: c.trapReason,
    })),
    ...fullText.map((c) => ({
      number: c.number,
      title: c.title || "(title not extracted)",
      badge: "required" as const,
      trapReason: null,
    })),
  ];
  const reference: ClauseMatrixRow[] = byRef.map((c) => ({
    number: c.number,
    title: c.title || "(title not extracted)",
    badge: "reference" as const,
    trapReason: null,
  }));

  return { required, reference, reference_count: reference.length };
}

// ───────────────────────────────────────────────────────────────────────────
// dedup_risks — Brain Q5: dedup by fingerprint, NO HARD CAP, every P0 shown.
// Density solved by progressive disclosure at the renderer (Rule 49), not here.
// ───────────────────────────────────────────────────────────────────────────

function severityRank(s: "P0" | "P1" | "P2"): number {
  return { P0: 3, P1: 2, P2: 1 }[s];
}

function titleFingerprint(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
}

export function dedupRisks(risks: AuditRisk[]): AuditRisk[] {
  const seen = new Map<string, AuditRisk>();
  for (const r of risks) {
    const fp = (r.trapClause ?? "") + "|" + titleFingerprint(r.title);
    const prev = seen.get(fp);
    if (!prev || severityRank(r.severity) > severityRank(prev.severity)) {
      seen.set(fp, r);
    }
  }
  return Array.from(seen.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

// ───────────────────────────────────────────────────────────────────────────
// title_normalized — canonical UCF section titles for §-numbered renders.
// ───────────────────────────────────────────────────────────────────────────

const CANONICAL_TITLES: Record<string, string> = {
  A: "Solicitation/Contract Form",
  B: "Schedule of Supplies / Services",
  C: "Scope / Statement of Work",
  D: "Packaging & Marking",
  E: "Inspection & Acceptance",
  F: "Deliveries & Performance",
  G: "Contract Administration",
  H: "Special Requirements",
  I: "Contract Clauses",
  J: "Attachments",
  K: "Representations & Certifications",
  L: "Instructions to Offerors",
  M: "Evaluation Factors",
};

export function titleNormalized(rawTitle: string | null | undefined, sectionKey: string): string {
  return CANONICAL_TITLES[sectionKey] ?? rawTitle ?? sectionKey;
}

// ───────────────────────────────────────────────────────────────────────────
// submission_checklist_filtered — Brain Q3: 6 buckets + catch-all.
// No requirement may render with undefined status.
// ───────────────────────────────────────────────────────────────────────────

export type ChecklistBucket =
  | "deadline"
  | "registration"
  | "mandatory_doc"
  | "representation"
  | "format"
  | "clearance"
  | "other";

export interface ChecklistItem {
  bucket: ChecklistBucket;
  text: string;
  isCritical: boolean;
  complete: boolean;
}

const BUCKET_ORDER: ChecklistBucket[] = [
  "deadline",
  "registration",
  "mandatory_doc",
  "representation",
  "clearance",
  "format",
  "other",
];

const BUCKET_LABELS: Record<ChecklistBucket, string> = {
  deadline: "Submission deadline",
  registration: "System registrations",
  mandatory_doc: "Required documents & product info",
  representation: "Representations & certifications",
  clearance: "Security clearance",
  format: "Format requirements",
  other: "Additional requirements",
};

// Brain Q3 — 6 buckets + catch-all. Same rules as engine-side
// deriveSubmissionStatusMeta (in src/lib/audit-engine.ts). When a §L imperative
// matches none of buckets 1–6, fall to bucket 7 (other) with bucket-7 label.
function bucketize(text: string, declaredBucket: string | null): ChecklistBucket {
  const t = (text || "").toLowerCase();
  if (declaredBucket && (BUCKET_ORDER as string[]).includes(declaredBucket)) {
    return declaredBucket as ChecklistBucket;
  }
  if (/\bregist|\bsam\.gov|\buei\b|\bduns\b|\bwawf\b/.test(t)) return "registration";
  if (/\bpage\s*limit|\bfont|\bformat|\bvolume\b|\bmargin/.test(t)) return "format";
  if (/\bpast\s*performance|\breferenc/.test(t)) return "mandatory_doc";
  if (/\bdemo|\boral|\bpresentation|\bsite\s*visit/.test(t)) return "mandatory_doc";
  if (/\brepresent|\bcertif|\backnowledg/.test(t)) return "representation";
  if (/\bclearanc|\bts\/sci|\bsecret|\bclassified/.test(t)) return "clearance";
  if (/\bdue|\bsubmit\s+by|\bdeadline|\bno\s+later\s+than|\bclose\s+of\s+business/.test(t)) return "deadline";
  return "other";
}

// Per Brain REV2: bucket-level `critical` flag derives from the bucket TYPE
// (deadline / registration / mandatory_doc = critical) so the renderer can
// drive .ck-group.is-critical styling from DATA, not group position. Per-
// item `severity` ('critical' | 'normal') comes from the underlying
// requirement's isCritical flag.
const CRITICAL_BUCKETS = new Set<ChecklistBucket>(["deadline", "registration", "mandatory_doc"]);

export interface ChecklistBucketGroup {
  bucket: ChecklistBucket;
  label: string;
  critical: boolean;
  items: ChecklistItem[];
}

export function submissionChecklistFiltered(facts: ExtractedFacts): ChecklistBucketGroup[] {
  const buckets = new Map<ChecklistBucket, ChecklistItem[]>();
  for (const b of BUCKET_ORDER) buckets.set(b, []);

  // Dedup by case-insensitive punctuation-stripped fingerprint.
  const seen = new Set<string>();
  for (const req of facts.submissionRequirements) {
    const fp = (req.text || "").toLowerCase().replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim();
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    const bucket = bucketize(req.text, req.bucket);
    buckets.get(bucket)!.push({ bucket, text: req.text, isCritical: req.isCritical, complete: false });
  }

  // Always surface the offer due date as a deadline if extracted and no
  // deadline-bucketed §L imperative already covered it.
  if (facts.offerDueDate && buckets.get("deadline")!.length === 0) {
    buckets.get("deadline")!.push({
      bucket: "deadline",
      text: `Offer due: ${facts.offerDueDate}`,
      isCritical: true,
      complete: false,
    });
  }

  return BUCKET_ORDER.filter((b) => (buckets.get(b)?.length ?? 0) > 0).map((b) => ({
    bucket: b,
    label: BUCKET_LABELS[b],
    // critical flag is DATA, not position — REV2 anti-positional ruling.
    // Renderer reads .critical to apply .ck-group.is-critical styling.
    critical: CRITICAL_BUCKETS.has(b),
    items: buckets.get(b)!.sort((a, x) => Number(x.isCritical) - Number(a.isCritical)),
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// compliance_flags — Brain Q4 §04 Fix 4
// Source: AuditRisk[] filtered to offerorActionRequired === true (= each risk
// the §04 surface uses also carries the mitigation language, eliminating the
// "Clause-level detail not extracted" fallback by construction).
// Empty → §04 hidden by renderer. All-inferred → render with marker.
// ───────────────────────────────────────────────────────────────────────────

export interface ComplianceFlag {
  id: string;
  title: string;
  severity: "P0" | "P1" | "P2";
  mitigation: string;
  sectionReference: string;
  clause: string | null;
  provenance: "verified" | "inferred";
}

export function complianceFlags(
  risks: AuditRisk[],
  offerorActionRequiredFilter: (r: AuditRisk) => boolean
): { flags: ComplianceFlag[]; allInferred: boolean } {
  const filtered = risks.filter(offerorActionRequiredFilter);
  const flags: ComplianceFlag[] = filtered.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    mitigation: r.mitigation,
    sectionReference: r.sectionReference,
    clause: r.trapClause,
    // Provenance: 'verified' when the risk cites a specific clause from the
    // extracted data, 'inferred' otherwise.
    provenance: r.trapClause || /5?2?52\.\d{3}-\d{4}/.test(r.description) ? "verified" : "inferred",
  }));
  const allInferred = flags.length > 0 && flags.every((f) => f.provenance === "inferred");
  return { flags, allInferred };
}
