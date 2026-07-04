// A4 live-probe fixtures — render a GATED (honest-fail) and a CLEAN agentic report to /tmp so a real browser
// (Playwright, file://, no auth needed) can confirm the export affordance + print-blocking behavior.
//   npx tsx scripts/audit-ai/render-export-gate-probe.ts
import { writeFileSync } from "node:fs";
import { renderV4ReportFromRow as renderAgenticReportFromRow } from "@/lib/v4-report/report";

const cleanPayload = {
  verdict: "BID", eligible: true, reason: "Open, eligible; all unmet items are bidder-controllable gates to clear.",
  showStoppers: [], findings: [], coverage: { required: ["§L"], covered: ["§L"], missing: [] },
};
const row = (o: Record<string, unknown>) => ({
  id: "aud-probe-1", solicitation_number: "SP3300-26-Q-0165", title: "Probe", agency: "DLA",
  compliance_json: { engine: "agentic_v3", ...o },
});

// GATED — honest_fail=true (also representative of documents_complete=false / missing-payload)
writeFileSync("/tmp/report-gated.html", renderAgenticReportFromRow(row({ honest_fail: true, documents_complete: true, v3: cleanPayload })));
// CLEAN — grounded, complete
writeFileSync("/tmp/report-clean.html", renderAgenticReportFromRow(row({ honest_fail: false, documents_complete: true, v3: cleanPayload })));
console.log("wrote /tmp/report-gated.html and /tmp/report-clean.html");
