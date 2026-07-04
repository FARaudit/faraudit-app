// buildV4Data(audit) — the ADAPTER: persisted audit row → V4Data (the render contract).
// Everything traces to a persisted value or is dropped (absence rule). No field is invented.
// Binds per _DATA-CONTRACT.md; derives §L/§M/CLIN/dates per _DERIVATION-SPEC.md (card 225).
// Reads the SAME inputs as the v3 renderer: audit.compliance_json.v3 (V3ReportPayload) + audit-row columns.
import type { V3ReportPayload, FindingLite } from "@/lib/audit-v3-report";
import type {
  V4Data, V4Fact, V4Verdict, V4Coverage, V4Findings, V4Finding,
  V4SubmissionL, V4EvalM, V4Clins, V4Date, V4Provenance, Tone, Pole,
} from "@/lib/v4-report/render";

// ── pole → display word + tone (Brain doctrine; honest-fail poles carry noVerdict + noCharge) ──
const POLE_BAND: Record<string, string> = {
  BID: "BID",
  BID_WITH_CAUTION: "BID — WITH CAUTION",
  NO_BID: "NO-BID",
  INELIGIBLE: "INELIGIBLE",
  NEEDS_HUMAN_REVIEW: "NEEDS HUMAN REVIEW",
  INCOMPLETE: "INCOMPLETE",
  OUT_OF_SCOPE: "OUT OF SCOPE",
};
const POLE_TONE: Record<string, Tone> = {
  BID: "go",
  BID_WITH_CAUTION: "caution",
  NO_BID: "stop",
  INELIGIBLE: "stop",
  NEEDS_HUMAN_REVIEW: "slate",
  INCOMPLETE: "slate",
  OUT_OF_SCOPE: "slate",
};
const NO_VERDICT_POLES = new Set(["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "OUT_OF_SCOPE"]);

const s = (v: unknown): string => (v == null ? "" : String(v));

// ── derived-view candidate matchers (_DERIVATION-SPEC.md) ──
const RE_L = /§?\s*L\b|(^|\s)L[-\s]?\d/i;
const RE_M = /§?\s*M\b|(^|\s)M[-\s]?\d/i;
const RE_CLIN = /CLIN|§?\s*B\b/i;
const RE_DATE = /questions?\s+due|site\s+visit|pre-?proposal|award\b|due\s+date|closing/i;
// numeric tail of a citation, for §L ascending sort (L-4.1 before L-4.2)
const citeTail = (c: string): number => {
  const m = s(c).match(/(\d+(?:\.\d+)?)\s*$/);
  return m ? parseFloat(m[1]) : Number.POSITIVE_INFINITY;
};

function mapFinding(f: FindingLite): V4Finding {
  const out: V4Finding = { req: s(f.requirement), cite: s(f.citation) };
  if (f.excerpt) out.excerpt = s(f.excerpt);
  // "Clears when" callout: the curability note. curableInWindow implies a gate the bidder can clear.
  if (f.note) out.curability = s(f.note);
  // temporal timing-evidence strip — render only when the arriving field is present (Brain #1).
  if (f.temporalEvidence) out.temporal = f.temporalEvidence;
  // driver = the finding that drives the verdict → expanded by default (disqualifying / P0).
  if (f.disposition === "disqualifying" || f.severity === "P0") out.driver = true;
  return out;
}

// severity bucket: explicit severity wins; else infer from disposition
// (disqualifying→P0, gate_to_clear→P1). "met"→satisfied, "dropped"→excluded.
function severityOf(f: FindingLite): "P0" | "P1" | "P2" {
  if (f.severity) return f.severity;
  if (f.disposition === "disqualifying") return "P0";
  if (f.disposition === "gate_to_clear") return "P1";
  return "P2";
}

function buildFindings(all: FindingLite[]): V4Findings {
  const p0: V4Finding[] = [], p1: V4Finding[] = [], p2: V4Finding[] = [];
  const satisfied: { req: string; cite: string }[] = [];
  for (const f of all) {
    if (f.disposition === "dropped") continue;
    if (f.disposition === "met") { satisfied.push({ req: s(f.requirement), cite: s(f.citation) }); continue; }
    const v = mapFinding(f);
    const sev = severityOf(f);
    if (sev === "P0") p0.push(v);
    else if (sev === "P1") p1.push(v);
    else p2.push(v);
  }
  return { p0, p1, p2, satisfied };
}

// ── §L submission matrix (derived) ──
function buildSubmissionL(all: FindingLite[]): V4SubmissionL | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "submission_instruction" || RE_L.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const rows = set
    .slice()
    .sort((a, b) => citeTail(s(a.citation)) - citeTail(s(b.citation)))
    // Volume column drops (engine does not type a volume grouping) → degrade to req + condition + cite.
    .map((f) => ({ vol: "", req: s(f.requirement), condition: s(f.excerpt || ""), cite: s(f.citation) }));
  return { grounded: true, rows };
}

// ── §M evaluation grid (derived; persisted order = descending importance, DO NOT re-sort) ──
function buildEvalM(all: FindingLite[]): V4EvalM | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "evaluation_factor" || RE_M.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const factors = set.map((f) => ({ name: s(f.requirement), basis: s(f.excerpt || f.note || ""), cite: s(f.citation) }));
  return { grounded: true, basis: "", factors };
}

// ── CLIN structure (derived; degrade to CLIN + Title + Cite when attrs untyped) ──
function buildClins(all: FindingLite[]): V4Clins | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "clin" || RE_CLIN.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const rows = set.map((f) => {
    const clinNo = (s(f.requirement).match(/\b(\d{4})\b/) || s(f.citation).match(/\b(\d{4})\b/) || [])[1] || "";
    return { clin: clinNo, title: s(f.requirement), type: "", qtyUnit: "", period: "" };
  });
  return { grounded: true, rows };
}

// ── key dates: audit-row response_deadline (primary, gate) + date-typed findings ──
function buildDates(responseDeadline: string, all: FindingLite[]): V4Date[] {
  const out: V4Date[] = [];
  if (responseDeadline) out.push({ label: "Quote/Proposal due", value: responseDeadline, kind: "gate" });
  for (const f of all) {
    if (f.disposition === "dropped") continue;
    if (f.kind === "date" || RE_DATE.test(s(f.requirement)) || RE_DATE.test(s(f.citation))) {
      const label = s(f.requirement).slice(0, 60);
      if (label && !out.some((d) => d.label === label)) out.push({ label, value: "", kind: "" });
    }
  }
  return out;
}

function buildCoverage(p: V3ReportPayload): V4Coverage {
  const cov = p.coverage || { required: [], covered: [], missing: [] };
  const docs = p.documents || null;
  // COMPLETE requires the deterministic guarantee; anything else is INCOMPLETE.
  const complete = docs ? docs.complete === true : false;
  const state = complete ? "COMPLETE" : "INCOMPLETE";
  const required = Array.isArray(cov.required) ? cov.required : [];
  const covered = new Set(Array.isArray(cov.covered) ? cov.covered : []);
  const core = required.map((k) => ({ k, ok: covered.has(k) }));
  const missing = [
    ...(Array.isArray(cov.missing) ? cov.missing : []),
    ...((docs?.missing || []).map((m) => (m.reason ? `${m.name} — ${m.reason}` : m.name))),
  ];
  const coreMissing = Array.isArray(cov.coreMissing) ? cov.coreMissing : [];
  return {
    state,
    lead: docs?.note || "",
    read: docs?.read ?? covered.size,
    indexed: 0,
    total: docs?.posted ?? required.length,
    core,
    missing,
    unreadable: coreMissing,
  } as V4Coverage;
}

/**
 * Adapt one persisted audit row → the V4 render contract. Mirrors the v3 renderer's
 * input reading (compliance_json.v3 + audit-row columns) so the two never diverge on source.
 */
export function buildV4Data(audit: Record<string, unknown>): V4Data {
  const cj = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const p = (cj.v3 as V3ReportPayload | undefined) ?? {
    verdict: "INCOMPLETE", eligible: null, reason: "",
    showStoppers: [], findings: [], coverage: { required: [], covered: [], missing: [] },
  } as V3ReportPayload;

  const solicitation = s(audit.solicitation_number);
  const title = s(audit.title);
  const agency = s(audit.agency);
  const naics = s(audit.naics_code);
  const setAside = s(audit.set_aside);
  const responseDeadline = s(audit.response_deadline);
  const pole = s(p.verdict) as Pole;

  // ── masthead — audit-row columns only (Brain #5), never compliance_json ──
  const facts: V4Fact[] = [];
  if (agency) facts.push({ k: "Agency", v: agency });
  if (naics) facts.push({ k: "NAICS", v: naics, mono: true });
  if (setAside) facts.push({ k: "Set-aside", v: setAside });
  if (responseDeadline) facts.push({ k: "Delivery", v: responseDeadline, sub: "response due" });
  // docType: no persisted notice-type column → derive honestly. OUT_OF_SCOPE (sources sought) is the only
  // case we can name from the pole; otherwise the neutral "SOLICITATION" (never fabricate RFQ vs RFP).
  const docType = pole === "OUT_OF_SCOPE" ? "SOURCES SOUGHT" : "SOLICITATION";

  // ── verdict ──
  const verdict: V4Verdict = {
    pole,
    band: POLE_BAND[pole] || pole,
    tone: POLE_TONE[pole] || "slate",
    noVerdict: NO_VERDICT_POLES.has(pole),
    noCharge: NO_VERDICT_POLES.has(pole), // AUDIT_HONESTFAIL_NO_CHARGE — all three honest-fails, never BID/CAUTION/NO_BID/INELIGIBLE
    eligible: p.eligible ?? null,          // tri-state; render suppresses the chip on OUT_OF_SCOPE (explicit pole rule)
    rationale: s(p.reason),                // VERBATIM — never paraphrase or trim
  };

  const all = Array.isArray(p.findings) ? p.findings : [];
  const findings: V4Findings = buildFindings(all);
  const coverage = buildCoverage(p);

  const provenance: V4Provenance = {
    auditDate: s(p.generatedAt),
    engine: "", // engine version must NEVER be customer-facing (CEO rule) — kept out of the render surface
    manifest: (p.documents?.missing || []).length || p.documents
      ? (p.documents?.missing || []).map((m) => ({ name: m.name, read: "unread" as const }))
      : [],
  };

  return {
    shell: { auditId: s(audit.id) },
    masthead: { docType, solicitation, title, facts },
    verdict,
    coverage,
    findings,
    submissionL: buildSubmissionL(all),
    evalM: buildEvalM(all),
    clins: buildClins(all),
    dates: buildDates(responseDeadline, all),
    provenance,
  } as V4Data;
}
