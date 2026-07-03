// $0 regression for the Doctrine #5 export-gating breach (Brain card 224, fix-seq step 5).
// Proves: a honest-fail / documents-incomplete / missing-payload agentic report renders NO export
// affordance and CSS-blocks printing (can never leave as a clean PDF); a clean report exports via the
// server PDF endpoint (which honours the 409), and NOTHING uses window.print() anymore.
//   npx tsx scripts/audit-ai/test-export-gating.ts
import { renderAgenticReportFromRow } from "@/lib/audit-v3-report";

const cleanPayload = {
  verdict: "BID", eligible: true, reason: "Open, eligible.",
  showStoppers: [], findings: [], coverage: { required: ["§L"], covered: ["§L"], missing: [] },
};
const row = (o: Record<string, unknown>) => ({
  id: "aud-123", solicitation_number: "SP3300-26-Q-0165",
  compliance_json: { engine: "agentic_v3", ...o },
});

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else fails.push(l); };
const EXPORT_LINK = 'href="/api/audit/aud-123/pdf"';

// 1. honest_fail=true → GATED
const g1 = renderAgenticReportFromRow(row({ honest_fail: true, documents_complete: true, v3: cleanPayload }));
ok("gated(honest_fail): no export link", !g1.includes(EXPORT_LINK));
ok("gated(honest_fail): shows 'Export unavailable'", g1.includes("Export unavailable"));
ok("gated(honest_fail): print-block CSS present", g1.includes("cannot be exported"));
ok("gated(honest_fail): no window.print", !g1.includes("window.print"));

// 2. documents_complete=false → GATED
const g2 = renderAgenticReportFromRow(row({ honest_fail: false, documents_complete: false, v3: cleanPayload }));
ok("gated(docs incomplete): no export link", !g2.includes(EXPORT_LINK));
ok("gated(docs incomplete): shows 'Export unavailable'", g2.includes("Export unavailable"));
ok("gated(docs incomplete): print-block CSS present", g2.includes("cannot be exported"));

// 3. missing cj.v3 payload (schema-drift fallback → INCOMPLETE) → FORCE-GATED
const g3 = renderAgenticReportFromRow(row({ honest_fail: false, documents_complete: true })); // no v3
ok("missing payload: force-gated (no export link)", !g3.includes(EXPORT_LINK));
ok("missing payload: shows 'Export unavailable'", g3.includes("Export unavailable"));
ok("missing payload: no window.print", !g3.includes("window.print"));

// 4. clean grounded report → EXPORT ENABLED via the server endpoint (never window.print)
const c1 = renderAgenticReportFromRow(row({ honest_fail: false, documents_complete: true, v3: cleanPayload }));
ok("clean: Export PDF links to the 409-honoring server endpoint", c1.includes(EXPORT_LINK));
ok("clean: no window.print anywhere", !c1.includes("window.print"));
ok("clean: not marked 'Export unavailable'", !c1.includes("Export unavailable"));
ok("clean: no print-block CSS", !c1.includes("cannot be exported"));

console.log(`export-gating gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — gated reports expose no export path + block printing; clean reports export via the 409-honoring endpoint; window.print() fully retired.");
