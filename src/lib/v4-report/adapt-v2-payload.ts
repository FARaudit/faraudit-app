// adaptV2ToV3Payload(audit) — a PRE-V3 audit, expressed in the v5 report's contract.
//
// WHY THIS EXISTS. The report route used to fork on `compliance_json.engine === "agentic_v3"`:
// audits from the graduated engine got the v5 "Gate Brief", everything older got the V1
// view-model template. 29 of the 105 complete audits — 14 of the 33 distinct solicitations, every
// one of them from before the v3 engine graduated — sat on the old surface permanently. Two
// reports for one product, and the split was invisible to the customer, who only saw that some of
// their own audits looked nothing like the others.
//
// Simply removing the fork does not work: `buildV4Data` reads `compliance_json.v3`, and its
// absence falls through to a hard-coded INCOMPLETE that tells the customer the payload "could not
// be loaded ... re-run to recover a complete report". Those 29 rows carry 38-39 populated fields
// each plus `overview_json` and `risks_json` — real analysis the V1 template renders today — so
// the flip alone would have replaced 29 working reports with a re-run notice.
//
// WHAT IS AND IS NOT CARRIED. Every field below traces to a persisted v2 value. Nothing is
// invented and nothing is paraphrased into a stronger form than it was stored in.
//
// The one thing a v2 audit does NOT have is v3's grounding: the v3 engine stores a verbatim
// `excerpt` from the source document behind every finding, and the v2 engine stored its own
// prose. `excerpt` is therefore left ABSENT on every adapted finding rather than filled with the
// requirement text — the v5 findings section prints "Every finding carries its citation and the
// verbatim text it rests on", and populating `excerpt` with engine prose would make the report
// state, of its own findings, something that is not true of them. `citation` is carried only
// where v2 actually stored one (gate_conditions.citation, the clause number on a dfars_flag);
// elsewhere it is empty, which the renderer already treats as absent.
//
// The provenance block does NOT name the engine — `V4Provenance.engine` is deliberately empty
// because engine versions are never customer-facing (standing CEO rule). What the customer sees
// is an older audit rendered in the current report, which is what was asked for; what they must
// not see is a claim of grounding that audit never had, which is why `excerpt` stays absent.
import type { V3ReportPayload, FindingLite } from "@/lib/audit-v3-report";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// v2 stored a decision shape, not a pole. `verdict.type` is DECISION_GATE or SCORED — neither is
// a commitment — and the commitment lives in `verdict.recommendation`, mirrored in
// `executive_summary.verdict`.
//
// THE VOCABULARY IS ENUMERATED, NOT GUESSED. Across all 29 pre-v3 audits there are exactly four
// distinct values: recommendation is PROCEED_WITH_CAUTION (24) or PROCEED (5), and the executive
// summary's mirror is CAUTION (24) or GO (5). The wider set below is defensive — a pole that never
// appears in the corpus costs nothing, and a recommendation that reaches this function unrecognised
// must not become a commitment.
//
// TOKENISED RATHER THAN REGEXED. `PROCEED_WITH_CAUTION` is one word to a `\b`-anchored pattern,
// because underscore is a word character — `/\bCAUTION\b/` does not match inside it. That is the
// same boundary failure that hid CUI banner markings from the CMMC recogniser (PR #593), and it
// would have read the caution audits as uncommitted here. Splitting on non-alphanumerics removes
// the question rather than answering it with a longer pattern.
function polefromV2(cj: Row): string {
  const tokens = new Set(
    `${str(obj(cj.verdict).recommendation)} ${str(obj(cj.executive_summary).verdict)}`
      .toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  );
  const any = (...t: string[]) => t.some((x) => tokens.has(x));

  // Order matters: a caution is a commitment WITH a caveat, and must be read before the bare
  // go-word it contains. "Fail toward the disqualifier" — the stopping poles are tested first.
  if (any("INELIGIBLE")) return "INELIGIBLE";
  if (any("NOBID") || (tokens.has("NO") && any("BID", "GO"))) return "NO_BID";
  if (any("CAUTION")) return "BID_WITH_CAUTION";
  if (any("PROCEED", "GO", "BID", "PURSUE")) return "BID";
  if (any("INCOMPLETE")) return "INCOMPLETE";
  return "NEEDS_HUMAN_REVIEW";
}

function finding(
  requirement: string,
  citation: string,
  kind: string,
  disposition: FindingLite["disposition"],
  severity?: FindingLite["severity"]
): FindingLite | null {
  const r = requirement.trim();
  if (!r) return null;
  const f: FindingLite = { requirement: r, citation: citation.trim(), disposition, kind };
  if (severity) f.severity = severity;
  return f;
}

/**
 * Build a V3ReportPayload from a pre-v3 audit row, or null when the row holds no v2 analysis
 * either — in which case the caller's INCOMPLETE fallback is the honest answer and this must not
 * manufacture a report out of nothing.
 */
export function adaptV2ToV3Payload(audit: Row): V3ReportPayload | null {
  const cj = obj(audit.compliance_json);
  if (cj.v3) return null;                       // a v3 payload exists; this adapter is not for it.
  const overview = obj(audit.overview_json);
  const risks = obj(audit.risks_json);
  const hasAnything =
    Object.keys(cj).length > 0 || Object.keys(overview).length > 0 || Object.keys(risks).length > 0;
  if (!hasAnything) return null;

  const out: FindingLite[] = [];
  const push = (f: FindingLite | null) => { if (f) out.push(f); };

  // ── show-stoppers: the gates v2 recorded, which are the things that stop a bid ──────────────
  // gate_conditions carry a real citation. verdict.gates carry a label + a verification action
  // and a status that is UNKNOWN until the customer checks — an unresolved gate is a gate to
  // clear, never a met one, so `status` is honoured rather than flattened.
  const showStoppers: FindingLite[] = [];
  for (const g of arr(cj.gate_conditions)) {
    const o = obj(g);
    const note = str(o.blocker_note);
    showStoppers.push({
      requirement: [str(o.title), str(o.context)].filter(Boolean).join(" — ") + (note ? ` ${note}` : ""),
      citation: str(o.citation),
      disposition: "gate_to_clear",
      kind: "eligibility_bar",
    });
  }
  for (const g of arr(obj(cj.verdict).gates)) {
    const o = obj(g);
    const label = str(o.gate_label);
    if (!label) continue;
    if (showStoppers.some((s) => s.requirement.startsWith(label))) continue;  // gate_conditions already carried it
    const status = str(o.status).toUpperCase();
    showStoppers.push({
      requirement: [label, str(o.verification_action)].filter(Boolean).join(" — "),
      citation: str(o.verification_url),
      disposition: status === "MET" || status === "PASS" ? "met" : "gate_to_clear",
      kind: "eligibility_bar",
    });
  }

  // ── clauses ────────────────────────────────────────────────────────────────────────────────
  // A FLAG IS A VERDICT, NOT A MENTION: a dfars_flag with detected:false is the finding that the
  // clause is ABSENT, and carrying it as a requirement would print the record of its absence as
  // an obligation. Same boolean the CMMC page and §04 of the report already honour.
  for (const f of arr(cj.dfars_flags)) {
    const o = obj(f);
    if (o.detected !== true) continue;
    const sev = str(o.severity).toUpperCase();
    push(finding(
      [str(o.title), str(o.description), str(o.required_action)].filter(Boolean).join(" — "),
      str(o.clause),
      "clause_flowdown",
      "gate_to_clear",
      sev === "P0" || sev === "P1" || sev === "P2" ? (sev as FindingLite["severity"]) : undefined
    ));
  }
  for (const c of [...arr(cj.dfars_clauses), ...arr(cj.far_clauses)]) {
    const t = str(c);
    if (!t) continue;
    // These are stored as a clause string, often "number — title". The number is the citation;
    // when there is no number the whole string stands as the requirement with no citation.
    const m = t.match(/^\s*((?:52|252|352|3052|AOC52)\.\d[\d-]*|\d+\.\d+[\d-]*)\s*[—–-]?\s*(.*)$/);
    push(m ? finding(m[2] || m[1], m[1], "clause_flowdown", "gate_to_clear")
          : finding(t, "", "clause_flowdown", "gate_to_clear"));
  }

  // ── submission + procedural obligations ────────────────────────────────────────────────────
  for (const s of arr(cj.submission_requirements)) {
    const o = obj(s);
    const done = str(o.status).toLowerCase();
    push(finding(str(o.requirement), "", "submission",
      done === "ok" || done === "done" || done === "met" ? "met" : "gate_to_clear"));
  }
  for (const a of arr(cj.key_compliance_actions)) push(finding(str(a), "", "procedural_obligation", "gate_to_clear"));
  for (const c of arr(cj.required_certifications)) push(finding(str(c), "", "eligibility_bar", "gate_to_clear"));

  // ── evaluation factors — §M substance, carried as findings so it is not lost ────────────────
  for (const e of arr(cj.evaluation_factors)) {
    const o = obj(e);
    push(finding([str(o.name), str(o.importance)].filter(Boolean).join(" — "), "", "past_performance", "gate_to_clear"));
  }

  // ── risks ──────────────────────────────────────────────────────────────────────────────────
  // prioritized_risks and risk_findings overlap heavily (the same text appears in both on live
  // rows), so they are merged on the text rather than concatenated into visible duplicates.
  const riskSeen = new Set<string>();
  for (const r of [...arr(risks.prioritized_risks), ...arr(risks.risk_findings)]) {
    const o = obj(r);
    const text = str(o.text) || str(r);
    if (!text || riskSeen.has(text)) continue;
    riskSeen.add(text);
    const sev = str(o.severity).toUpperCase();
    push(finding(text, str(o.citation), "other", "gate_to_clear",
      sev === "P0" || sev === "P1" || sev === "P2" ? (sev as FindingLite["severity"]) : undefined));
  }

  // ── the verdict's own words ────────────────────────────────────────────────────────────────
  const exec = obj(cj.executive_summary);
  const reason = str(exec.what) || str(overview.bottom_line_item) || str(overview.summary)
    || str(obj(cj.verdict).recommendation) || str(audit.summary);

  // v2 recorded no coverage model — it did not track which UCF sections were required against
  // which were read. Empty arrays say that honestly; inventing "covered" from the sections that
  // happen to have a summary would assert an analysis that never ran.
  return {
    verdict: polefromV2(cj),
    eligible: null,
    reason,
    showStoppers,
    findings: out,
    coverage: { required: [], covered: [], missing: [] },
  } as V3ReportPayload;
}
