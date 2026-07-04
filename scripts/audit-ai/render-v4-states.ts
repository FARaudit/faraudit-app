// v4 report — Gate-2 re-QA render harness + Δ3 coverage-binding regression guard.
// Renders three representative states through the REAL pipeline (renderV4ReportFromRow → buildV4Data →
// renderRichWeb) so Design can re-QA the ported build, and ASSERTS the coverage buckets are not crossed.
//   npx tsx scripts/audit-ai/render-v4-states.ts
// States: W50 (BID, bound to the real run-record w50-compliance-v3-REAL.json), INCOMPLETE (honest-fail,
// gated — the Δ3 fixture), OUT_OF_SCOPE (Sources Sought — proves the Δ1 pole-specific eyebrow).
// Masthead facts are illustrative design-spec values (the mock RFP fixture is a spec artifact, not shippable).
import { writeFileSync, readFileSync } from "node:fs";
import { renderV4ReportFromRow } from "@/lib/v4-report/report";

// Real run-record W50S9H26QA018 (Rule 64). Fixture lives in a stable committed path — NOT the relay hub,
// which gets archived (the original Send to Code/v4-report-B-2026-07-04/ port package was archived post-Gate-2).
const w50 = JSON.parse(
  readFileSync("scripts/audit-ai/fixtures/w50-compliance-v3-REAL.json", "utf8"),
);

// ── W50 · BID — real run-record (Rule 64: no synthetic gate fixture) ──
const w50Row = {
  id: "aud-w50",
  solicitation_number: "W50S9H26QA018",
  title: "Aircraft Component Repair Services",
  agency: "DEPT OF THE ARMY - NATIONAL GUARD",
  naics_code: "336413",
  set_aside: "Total Small Business Set-Aside",
  response_deadline: "2026-07-18",
  notice_type: "Combined Synopsis/Solicitation",
  compliance_json: w50,
};

// ── INCOMPLETE · honest-fail, gated — the Δ3 coverage fixture. Core sections L/M are absent from the package
//    (→ "Core section missing"); two posted documents could not be retrieved (→ "Could not be parsed"). These
//    MUST NOT cross: filenames belong in unreadable, section letters in missing. ──
const incompleteRow = {
  id: "aud-incomplete",
  solicitation_number: "SP0600-26-Q-0042",
  title: "Facility Support Services",
  agency: "DLA",
  naics_code: "336413",
  set_aside: "Total Small Business Set-Aside",
  response_deadline: "2026-07-20",
  notice_type: "Combined Synopsis/Solicitation",
  compliance_json: {
    engine: "agentic_v3",
    documents_complete: false,
    v3: {
      verdict: "INCOMPLETE",
      eligible: null,
      reason:
        "We could not read all of the binding content the agency posted — so we did not issue a verdict, and did not charge for this audit.",
      showStoppers: [],
      findings: [],
      coverage: { required: ["C", "I", "L", "M"], covered: ["C", "I"], missing: [], coreMissing: ["L", "M"] },
      documents: {
        posted: 4,
        read: 2,
        complete: false,
        note: "Two posted documents could not be retrieved; the report is held until they are recovered.",
        missing: [
          { name: "SOW.pdf", reason: "retrieval failed" },
          { name: "Section L-M.pdf", reason: "retrieval failed" },
        ],
      },
      generatedAt: "2026-07-04",
    },
  },
};

// ── OUT_OF_SCOPE · Sources Sought — proves the Δ1 pole-specific eyebrow ("outside audit scope", not
//    "human adjudication") and the OUT_OF_SCOPE eligibility-chip suppression. ──
const oosRow = {
  id: "aud-oos",
  solicitation_number: "N0018926R0000",
  title: "MS Sentinel Implementation (Sources Sought)",
  agency: "DEPT OF THE NAVY",
  naics_code: "541512",
  set_aside: "",
  response_deadline: "2026-07-25",
  notice_type: "Sources Sought",
  compliance_json: {
    engine: "agentic_v3",
    documents_complete: true,
    // honest_fail:true = the doctrine-correct persisted shape for OUT_OF_SCOPE (an honest-fail no-verdict pole).
    // ⚠ LIVE GAP (carded to Brain): the executor derives honest_fail via HONEST_FAIL_VERDICTS = {INCOMPLETE,
    // NEEDS_HUMAN_REVIEW} only; OUT_OF_SCOPE rides the not-yet-wired `outOfScope` signal, so a real live OOS row
    // would persist honest_fail:false → shouldGateExport would leave Export ENABLED on a NO-CHARGE band. Set here
    // so re-QA shows the intended gated render; the executor/predicate alignment is a Brain-owned gate decision.
    honest_fail: true,
    v3: {
      verdict: "OUT_OF_SCOPE",
      eligible: null,
      reason:
        "This is a Sources Sought notice — a market-research request, not a solicitation for offers. There is nothing to bid, so no verdict is issued.",
      showStoppers: [],
      findings: [],
      coverage: { required: [], covered: [], missing: [] },
      generatedAt: "2026-07-04",
    },
  },
};

const states: [string, Record<string, unknown>][] = [
  ["/tmp/v4-w50.html", w50Row],
  ["/tmp/v4-incomplete.html", incompleteRow],
  ["/tmp/v4-oos.html", oosRow],
];
for (const [path, row] of states) {
  writeFileSync(path, renderV4ReportFromRow(row));
  console.log("wrote", path);
}

// ── Δ3 regression guard: coverage buckets must not be crossed on the INCOMPLETE render. ──
const inc = renderV4ReportFromRow(incompleteRow);
const grab = (heading: RegExp): string => {
  const m = inc.match(heading);
  if (!m) return "";
  const start = m.index! ;
  const end = inc.indexOf("</div>", start);
  return inc.slice(start, end);
};
const missingBox = grab(/Core section missing<\/span><ul>[\s\S]*?<\/ul>/);
const parseBox = grab(/Could not be parsed[\s\S]*?<\/ul>/);
const fail: string[] = [];
if (!/<li>L<\/li>/.test(missingBox) || !/<li>M<\/li>/.test(missingBox))
  fail.push("Core-missing box must list bare sections L and M");
if (/SOW\.pdf/.test(missingBox) || /Section L-M\.pdf/.test(missingBox))
  fail.push("Core-missing box must NOT contain document filenames (buckets crossed)");
if (!/SOW\.pdf/.test(parseBox) || !/Section L-M\.pdf/.test(parseBox))
  fail.push("Could-not-be-parsed box must list the retrieval-failed filenames");
if (/<li class="mono">L<\/li>/.test(parseBox) || /<li class="mono">M<\/li>/.test(parseBox))
  fail.push("Could-not-be-parsed box must NOT contain bare section letters (buckets crossed)");

// ── Δ1 regression guard: pole-specific honest-fail eyebrows. ──
if (!/No verdict — coverage incomplete/.test(inc)) fail.push("INCOMPLETE eyebrow must read 'coverage incomplete'");
if (!/No verdict — outside audit scope/.test(renderV4ReportFromRow(oosRow)))
  fail.push("OUT_OF_SCOPE eyebrow must read 'outside audit scope'");

if (fail.length) {
  console.error("\n❌ REGRESSION:\n - " + fail.join("\n - "));
  process.exit(1);
}
console.log("\n✅ Δ1 eyebrows pole-specific · Δ3 coverage buckets not crossed");
