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
// noVerdict + noCharge apply to all three honest-fail poles (per _DATA-CONTRACT §verdict + port prompt:
// "NHR + INCOMPLETE + OUT_OF_SCOPE all carry noCharge:true → the NO CHARGE chip"). NOTE: whether the audit
// was ACTUALLY not charged depends on AUDIT_HONESTFAIL_NO_CHARGE (OFF in prod → billing still charges) — the
// display-vs-billing reconciliation is the open S-4/D blocker, out of scope for this render adapter.
const NO_VERDICT_POLES = new Set(["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "OUT_OF_SCOPE"]);

const s = (v: unknown): string => (v == null ? "" : String(v));

// ── derived-view candidate matchers (_DERIVATION-SPEC.md) ──
// Require an explicit UCF section anchor (§L / L-6) — a BARE letter must NOT pull a finding into the wrong
// section (review fix: "Proposal" ends in 'l' → was matching §L; "M0001" amendment → was matching §M). A
// separator is required after the letter so amendment/mod tokens (M0001, B0001) don't false-match. `kind`
// stays the PRIMARY signal; the regex is only the fallback when the engine did not type the finding.
const RE_L = /§\s*L\b|(?:^|[\s(])L[-.\s]\d/i;
const RE_M = /§\s*M\b|(?:^|[\s(])M[-.\s]\d/i;
const RE_CLIN = /\bCLIN\b|§\s*B\b/i;
// numeric tail of a citation, for §L ascending sort (L-4.1 before L-4.2)
const citeTail = (c: string): number => {
  const m = s(c).match(/(\d+(?:\.\d+)?)\s*$/);
  return m ? parseFloat(m[1]) : Number.POSITIVE_INFINITY;
};

// Union showStoppers + findings (deduped), matching the v3 renderer: buildV3Payload persists them from
// INDEPENDENT sources, and a disqualifying finding carried ONLY in showStoppers must still render — else a
// NO_BID/INELIGIBLE band shows an empty Show-stoppers group (the worst error class). showStoppers first.
function unionFindings(showStoppers: FindingLite[], findings: FindingLite[]): FindingLite[] {
  const seen = new Set<string>();
  const out: FindingLite[] = [];
  for (const f of [...showStoppers, ...findings]) {
    const k = `${s(f.requirement)}|${s(f.citation)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

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
    // ascending by citation numeric tail; NaN (both tail-less → Infinity-Infinity) must not corrupt the sort.
    .sort((a, b) => { const d = citeTail(s(a.citation)) - citeTail(s(b.citation)); return Number.isNaN(d) ? 0 : d; })
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

// ── key dates: audit-row response_deadline is the ONLY persisted date VALUE. FindingLite carries no date
// value field, so finding-derived milestones would render valueless rows — omit them (never fabricate; a
// timeline of empty dates is worse than none). Additional milestones await a persisted date value upstream. ──
function buildDates(responseDeadline: string): V4Date[] {
  return responseDeadline ? [{ label: "Quote/Proposal due", value: responseDeadline, kind: "gate" }] : [];
}

function buildCoverage(p: V3ReportPayload, documentsComplete: boolean): V4Coverage {
  const cov = p.coverage || { required: [], covered: [], missing: [] };
  const docs = p.documents || null;
  const state = documentsComplete ? "COMPLETE" : "INCOMPLETE";
  const required = Array.isArray(cov.required) ? cov.required : [];
  const covered = new Set(Array.isArray(cov.covered) ? cov.covered : []);
  const coreMissing = Array.isArray(cov.coreMissing) ? cov.coreMissing : [];
  // core chips = required ∪ coreMissing (a core section absent-from-package lives only in coreMissing, and
  // must still surface as a "missing" chip — matches the v3 renderer's section-key union).
  const coreKeys = Array.from(new Set([...required, ...coreMissing]));
  const core = coreKeys.map((k) => ({ k, ok: covered.has(k) }));
  // "Core section missing" = required-but-uncovered ∪ absent-from-package (coreMissing). NOT retrieval failures.
  const missing = Array.from(new Set([...(Array.isArray(cov.missing) ? cov.missing : []), ...coreMissing]));
  // "Could not be parsed" = files the engine had but could NOT read/retrieve (documents.missing) — a genuine
  // parse/retrieval failure. coreMissing (never in the package) is absence, NOT a parse failure — keep them apart.
  const unreadable = (docs?.missing || []).map((m) => (m.reason ? `${m.name} — ${m.reason}` : m.name));
  const total = docs?.posted ?? required.length;
  const rawRead = docs?.read ?? covered.size;
  const read = Math.min(rawRead, total); // never exceed total → coverage % can't blow past 100
  return { state, lead: docs?.note || "", read, indexed: 0, total, core, missing, unreadable } as V4Coverage;
}

// notice/procurement type → masthead badge word. Reads the persisted notice_type column when present
// (facts-vs-analysis: bind the real column); falls back to an HONEST pole heuristic only when absent.
function deriveDocType(noticeType: string, pole: Pole): string {
  const nt = noticeType.trim().toLowerCase();
  if (nt) {
    if (/sources\s*sought|rfi|request for information/.test(nt)) return "SOURCES SOUGHT";
    if (/combined|synopsis|rfq|request for quot/.test(nt)) return "RFQ";
    if (/\brfp\b|request for proposal/.test(nt)) return "RFP";
    if (/presol/.test(nt)) return "PRESOLICITATION";
    return noticeType.trim().toUpperCase().slice(0, 24);
  }
  return pole === "OUT_OF_SCOPE" ? "SOURCES SOUGHT" : "SOLICITATION";
}

/**
 * Adapt one persisted audit row → the V4 render contract. Mirrors the v3 renderer's
 * input reading (compliance_json.v3 + audit-row columns) so the two never diverge on source.
 */
export function buildV4Data(audit: Record<string, unknown>): V4Data {
  const cj = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const p = (cj.v3 as V3ReportPayload | undefined) ?? {
    // schema-drift / missing payload → INCOMPLETE with an EXPLANATORY rationale (never a blank verdict).
    verdict: "INCOMPLETE", eligible: null,
    reason: "The agentic report payload could not be loaded for this audit — it is under review and was not charged. Re-run to recover a complete report.",
    showStoppers: [], findings: [], coverage: { required: [], covered: [], missing: [] },
  } as V3ReportPayload;

  const solicitation = s(audit.solicitation_number);
  const title = s(audit.title);
  const agency = s(audit.agency);
  const naics = s(audit.naics_code);
  const setAside = s(audit.set_aside);
  const responseDeadline = s(audit.response_deadline);
  const pole = s(p.verdict) as Pole;
  // authoritative completeness = the top-level compliance_json.documents_complete (C-group truth-source,
  // sibling of v3 — same field shouldGateExport reads), so the report state matches the export gate.
  const documentsComplete = (cj.documents_complete as boolean | undefined) === true
    || (cj.documents_complete === undefined && p.documents?.complete === true);

  // ── masthead — audit-row columns only (Brain #5), never compliance_json ──
  const facts: V4Fact[] = [];
  if (agency) facts.push({ k: "Agency", v: agency });
  if (naics) facts.push({ k: "NAICS", v: naics, mono: true });
  if (setAside) facts.push({ k: "Set-aside", v: setAside });
  if (responseDeadline) facts.push({ k: "Delivery", v: responseDeadline, sub: "response due" });
  const docType = deriveDocType(s(audit.notice_type), pole);

  // ── verdict ──
  const verdict: V4Verdict = {
    pole,
    band: POLE_BAND[pole] || pole,
    tone: POLE_TONE[pole] || "slate",
    noVerdict: NO_VERDICT_POLES.has(pole),
    noCharge: NO_VERDICT_POLES.has(pole),
    eligible: p.eligible ?? null,          // tri-state; render suppresses the chip on OUT_OF_SCOPE (explicit pole rule)
    rationale: s(p.reason),                // VERBATIM — never paraphrase or trim
  };

  // union showStoppers + findings so a blocker carried only in showStoppers still renders
  const all = unionFindings(Array.isArray(p.showStoppers) ? p.showStoppers : [], Array.isArray(p.findings) ? p.findings : []);
  const findings: V4Findings = buildFindings(all);
  const coverage = buildCoverage(p, documentsComplete);

  // "Audited/Evaluated" date — bind the first persisted date available (Design Gate-2 flag: some run-records,
  // incl. the real W50 fixture, carry a null v3.generatedAt → the readout showed "Evaluated —"). Fall back
  // through the sibling top-level stamp then the row's own completion/creation columns; genuine absence → "".
  const auditDate = s(p.generatedAt) || s(cj.generated_at) || s(audit.completed_at) || s(audit.created_at);
  const provenance: V4Provenance = {
    auditDate,
    engine: "", // engine version must NEVER be customer-facing (CEO rule) — no longer rendered (Engine row removed)
    // read-file NAMES are not persisted (only counts + the missing list), so the manifest can only surface the
    // files the engine could NOT read, marked unread. A COMPLETE audit → empty manifest (nothing to flag).
    manifest: (p.documents?.missing || []).map((m) => ({ name: m.name, read: "unread" as const })),
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
    dates: buildDates(responseDeadline),
    provenance,
  } as V4Data;
}
