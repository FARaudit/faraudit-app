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
import type { AuditRisk } from "../../../lib/audit-judgment";

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
  if (clauses.length === 0) return [];

  // Traps first, then full-text incorporations, then everything else.
  const traps = clauses.filter((c) => c.isTrap);
  const fullText = clauses.filter((c) => !c.isTrap && c.incorporated === "full_text");
  const byRef = clauses.filter((c) => !c.isTrap && c.incorporated === "by_reference");

  const out: ClauseMatrixRow[] = [];
  for (const c of traps) {
    out.push({ number: c.number, title: c.title || "(title not extracted — verify in solicitation)", badge: "trap", trapReason: c.trapReason });
  }
  for (const c of fullText) {
    out.push({ number: c.number, title: c.title || "(title not extracted)", badge: "required", trapReason: null });
  }
  // Collapse by-reference clauses into a rollup IF there are many; otherwise
  // surface each one individually.
  if (byRef.length > 6) {
    const farCount = byRef.filter((c) => c.number.startsWith("52.")).length;
    const dfarsCount = byRef.filter((c) => c.number.startsWith("252.")).length;
    const otherCount = byRef.length - farCount - dfarsCount;
    const parts: string[] = [];
    if (farCount > 0) parts.push(`${farCount} FAR`);
    if (dfarsCount > 0) parts.push(`${dfarsCount} DFARS`);
    if (otherCount > 0) parts.push(`${otherCount} other`);
    out.push({
      number: `(${byRef.length} total)`,
      title: `${parts.join(" + ")} standard clauses incorporated by reference`,
      badge: "rollup",
      trapReason: null,
    });
  } else {
    for (const c of byRef) {
      out.push({ number: c.number, title: c.title || "(title not extracted)", badge: "reference", trapReason: null });
    }
  }
  return out;
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

export function submissionChecklistFiltered(
  facts: ExtractedFacts
): Array<{ bucket: ChecklistBucket; label: string; items: ChecklistItem[] }> {
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
