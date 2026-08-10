// ─────────────────────────────────────────────────────────────────────────────
// PRE-V3 AUDITS IN THE v5 REPORT.
//
// The route no longer forks on `compliance_json.engine === "agentic_v3"`, so 29 of the 105
// complete audits — every one from before the v3 engine graduated — now render in the current
// report instead of the V1 template. The risk of that change is NOT that they fail to render: it
// is that they render an empty-looking shell while the analysis they hold is silently dropped, or
// that adapted prose is dressed up as grounded verbatim source. Both are checked here.
//
// The fixture rows are transcribed from production `audits` (shapes verified live 2026-08-10):
// gate_conditions/verdict.gates/dfars_flags/submission_requirements/key_compliance_actions/
// required_certifications/evaluation_factors/far_clauses + overview_json + risks_json.
//
// Run: npx tsx test/v2-payload-adapter.test.ts
// ─────────────────────────────────────────────────────────────────────────────
import { adaptV2ToV3Payload } from "../src/lib/v4-report/adapt-v2-payload";
import { buildV4Data } from "../src/lib/v4-report/build-data";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// A real pre-v3 row, reduced to the fields the adapter reads.
const V2_ROW = {
  id: "a1", solicitation_number: "W900KK26RA017", title: "Medical simulation support", agency: "ACC-ORLANDO",
  created_at: "2026-06-28T12:00:00Z", status: "complete",
  compliance_json: {
    analysis_phase: "phase2",
    verdict: {
      type: "DECISION_GATE",
      recommendation: "Bid with caution — clear SPRS before quoting.",
      gates: [
        { status: "UNKNOWN", gate_id: "SPRS_SCORE_REQUIRED", gate_label: "Current SPRS score required",
          verification_url: "https://www.sprs.csd.disa.mil/", verification_action: "Verify your SPRS Basic Assessment is current" },
        { status: "UNKNOWN", gate_id: "EVAL_PASS_FAIL_1", gate_label: "Pass/Fail: Factor 1 Program Management Plan",
          verification_action: "Achieve no less than Acceptable" },
      ],
    },
    executive_summary: { what: "ACC-ORLANDO is buying 110-FTE FFP medical simulation instructor support.", verdict: "BID WITH CAUTION", actions: [], factors: [] },
    gate_conditions: [
      { title: "Current SPRS score required", context: "Verify your SPRS Basic Assessment is posted and current", citation: "DFARS 252.204-7020", blocker_note: "" },
    ],
    dfars_flags: [
      { title: "Hexavalent Chromium", clause: "252.223-7008", detected: true, severity: "P0", description: "", required_action: "" },
      { title: "CMMC Requirements", clause: "252.204-7021", detected: false, severity: "P1", description: "", required_action: "" },
    ],
    far_clauses: ["52.204-21 — Basic Safeguarding of Covered Contractor Information Systems", "52.222-41"],
    submission_requirements: [
      { meta: "Action", status: "todo", requirement: "Submit proposals no later than 27 July 2026 at 09:00 AM EDT." },
      { meta: "Clear", status: "ok", requirement: "Submit the entire proposal electronically." },
    ],
    key_compliance_actions: ["Submit proposal via DoD SAFE no later than 27 July 2026 (Section L.2.2a)"],
    required_certifications: ["SAM.gov active registration (52.204-7 / 52.204-13)"],
    evaluation_factors: [{ name: "Factor 1: Program Management Plan", importance: "GATE (pass/fail)", rank: 1, tone: "mute", coverage: "—", coverage_pct: 0 }],
  },
  overview_json: { summary: "110-FTE FFP contract.", bottom_line_item: "Bid with caution." },
  risks_json: {
    prioritized_risks: [{ text: "L.3.3.4 sets a direct-labor floor rate; a sub-floor rate renders the proposal ineligible.", severity: "P0" }],
    risk_findings: [{ text: "L.3.3.4 sets a direct-labor floor rate; a sub-floor rate renders the proposal ineligible.", severity: "P0" }],
  },
};

console.log("── A · the analysis survives the adaptation ──");
const p = adaptV2ToV3Payload(V2_ROW as Record<string, unknown>);
ok(!!p, "a pre-v3 row produces a payload rather than null");
const all = [...(p?.showStoppers ?? []), ...(p?.findings ?? [])];
const has = (frag: string) => all.some((f) => f.requirement.includes(frag));

ok(has("SPRS"), "the SPRS gate is carried");
ok(has("Pass/Fail: Factor 1"), "a verdict.gate with no matching gate_condition is still carried");
ok(has("Hexavalent Chromium"), "a detected DFARS flag is carried");
ok(has("27 July 2026"), "a submission requirement is carried");
ok(has("DoD SAFE"), "a key compliance action is carried");
ok(has("SAM.gov"), "a required certification is carried");
ok(has("Basic Safeguarding"), "a FAR clause is carried");
ok(has("direct-labor floor"), "a prioritized risk is carried");
ok(all.length >= 9, `nothing was silently dropped — ${all.length} findings carried`, `got ${all.length}`);

console.log("\n── B · what the v2 audit did NOT have is not invented ──");
// The v5 findings section tells the reader every finding carries "the verbatim text it rests on".
// A v2 audit has no verbatim excerpt, so filling one in would make the report state a falsehood.
ok(all.every((f) => f.excerpt === undefined),
  "no adapted finding carries an excerpt — v2 stored prose, not a verbatim source quote",
  `${all.filter((f) => f.excerpt !== undefined).length} carry one`);
ok(p!.coverage.required.length === 0 && p!.coverage.covered.length === 0,
  "coverage stays empty — v2 tracked no required-vs-read model, so a covered count would be invented");
// A flag recorded detected:false is the finding that the clause is ABSENT.
ok(!has("CMMC Requirements"),
  "an undetected DFARS flag is NOT carried as an obligation", "252.204-7021 detected:false");

console.log("\n── C · the verdict is v2's own word, never a guessed one ──");
ok(p!.verdict === "BID_WITH_CAUTION", "'Bid with caution' maps to BID_WITH_CAUTION", `got ${p!.verdict}`);
const unknownVerdict = adaptV2ToV3Payload({ compliance_json: { verdict: { type: "SCORED", recommendation: "" }, naics: "541330" } });
ok(unknownVerdict?.verdict === "NEEDS_HUMAN_REVIEW",
  "an unreadable recommendation becomes NEEDS_HUMAN_REVIEW, never a guessed BID", `got ${unknownVerdict?.verdict}`);
ok(adaptV2ToV3Payload({ compliance_json: { verdict: { recommendation: "No-bid — set-aside excludes us" } } })?.verdict === "NO_BID",
  "'No-bid' maps to NO_BID");
// THE WHOLE OBSERVED VOCABULARY. Across the 29 live pre-v3 audits there are exactly four values:
// PROCEED_WITH_CAUTION (24) / CAUTION (24), and PROCEED (5) / GO (5). Both underscore forms are
// asserted because `\bCAUTION\b` cannot match inside PROCEED_WITH_CAUTION — underscore is a word
// character, and a regex-based mapping read those 24 audits' recommendation as unrecognised.
const V2_VOCAB: Array<[string, string, string]> = [
  ["PROCEED_WITH_CAUTION", "CAUTION", "BID_WITH_CAUTION"],
  ["PROCEED", "GO", "BID"],
];
for (const [rec, exec, expected] of V2_VOCAB) {
  ok(adaptV2ToV3Payload({ compliance_json: { verdict: { recommendation: rec } } })?.verdict === expected,
    `recommendation ${rec} -> ${expected}`,
    `got ${adaptV2ToV3Payload({ compliance_json: { verdict: { recommendation: rec } } })?.verdict}`);
  ok(adaptV2ToV3Payload({ compliance_json: { executive_summary: { verdict: exec } } })?.verdict === expected,
    `executive_summary.verdict ${exec} -> ${expected}`,
    `got ${adaptV2ToV3Payload({ compliance_json: { executive_summary: { verdict: exec } } })?.verdict}`);
}
// The underscore form must not be readable as a bare go-word either.
ok(adaptV2ToV3Payload({ compliance_json: { verdict: { recommendation: "PROCEED_WITH_CAUTION" } } })?.verdict !== "BID",
  "PROCEED_WITH_CAUTION is never flattened to a plain BID");

console.log("\n── D · the adapter does not touch a v3 audit, and does not invent from nothing ──");
ok(adaptV2ToV3Payload({ compliance_json: { v3: { verdict: "BID", findings: [] } } }) === null,
  "a row that HAS a v3 payload is left alone");
ok(adaptV2ToV3Payload({ compliance_json: {} }) === null, "an empty compliance_json produces null, not a report");
ok(adaptV2ToV3Payload({}) === null, "a row with no payload at all produces null — the INCOMPLETE fallback owns that case");

console.log("\n── E · end to end: the row renders as a real report, not the re-run notice ──");
const d = buildV4Data(V2_ROW as Record<string, unknown>);
ok(d.verdict.band === "BID — WITH CAUTION", "the rendered verdict band is v2's own", `got ${d.verdict.band}`);
ok(!JSON.stringify(d.verdict).includes("could not be loaded"),
  "the report does NOT say the payload could not be loaded — that was the pre-adapter behaviour");
const rendered = d.findings.p0.length + d.findings.p1.length + d.findings.p2.length;
ok(rendered > 0, `findings reach the render contract`, `${rendered} rendered`);
ok(d.masthead.solicitation === "W900KK26RA017", "the masthead still binds the row's own columns");

// NEGATIVE CONTROL — the INCOMPLETE fallback must still be reachable, or this gate proved nothing
// about the case it replaced.
const empty = buildV4Data({ id: "e", solicitation_number: "X", compliance_json: null });
ok(JSON.stringify(empty.verdict).includes("could not be loaded") || empty.verdict.band === "INCOMPLETE",
  "a row with genuinely no payload still renders INCOMPLETE — the fallback was not deleted",
  `band=${empty.verdict.band}`);

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nPRE-V3 ADAPTATION FAILED — an old audit would render without the analysis it holds.");
  process.exit(1);
}
console.log("v2 payload adapter clean.");
