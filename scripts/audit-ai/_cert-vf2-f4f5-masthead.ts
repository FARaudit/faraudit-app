// CERT — Vehicle F2 · F-5 (AUDIT_COVERAGE_DISPLAY_COHERENT) + F-4 (AUDIT_MASTHEAD_OFFICE_LEAF). Faithful fixture
// 496a9a21 (coverage.state=INCOMPLETE, read=9/9; office_leaf=null). $0.
import { readFileSync } from "node:fs";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";

const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json", "utf8"));
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fails++; };
// masthead readout coverage value (the vdr-row, not the coverage card)
const covReadout = (html: string): string | null => {
  const m = html.match(/vdr-k">Coverage<\/span><span class="vdr-v">([^<]*)</);
  return m ? m[1].trim() : null;
};
const hasOfficeLeaf = (html: string, val: string) => html.includes(`mf-k">Issuing office</div>`) && html.includes(val);

// ── F-5 coverage coherence ──
delete process.env.AUDIT_COVERAGE_DISPLAY_COHERENT;
delete process.env.AUDIT_MASTHEAD_OFFICE_LEAF;
const off = renderV4ReportFromRow(row);
console.log(`[flag-OFF] masthead coverage = ${JSON.stringify(covReadout(off))}`);
ok(covReadout(off) === "100%", "F-5 flag-OFF: masthead shows read-based '100%' (legacy — contradicts the INCOMPLETE card)");

process.env.AUDIT_COVERAGE_DISPLAY_COHERENT = "true";
const on = renderV4ReportFromRow(row);
console.log(`[flag-ON ] masthead coverage = ${JSON.stringify(covReadout(on))}`);
ok(covReadout(on) === "Incomplete", "F-5 flag-ON: masthead shows 'Incomplete' (grounded axis, coherent with the coverage card)");
ok(!/100%/.test(covReadout(on) || ""), "F-5 flag-ON: the contradictory '100%' is gone from the masthead readout");

// ── F-4 office-leaf: compute-or-absent ──
process.env.AUDIT_MASTHEAD_OFFICE_LEAF = "true";
const onNullLeaf = renderV4ReportFromRow(row);
ok(!onNullLeaf.includes(`mf-k">Issuing office</div>`), "F-4 flag-ON + office_leaf NULL: no 'Issuing office' fact (compute-or-absent — never fabricated)");
const rowWithLeaf = { ...row, office_leaf: "AFSC/PZIOC" };
const onWithLeaf = renderV4ReportFromRow(rowWithLeaf);
ok(hasOfficeLeaf(onWithLeaf, "AFSC/PZIOC"), "F-4 flag-ON + office_leaf present: 'Issuing office · AFSC/PZIOC' surfaced");

// ── flag-OFF byte-identity preserved ──
delete process.env.AUDIT_COVERAGE_DISPLAY_COHERENT;
delete process.env.AUDIT_MASTHEAD_OFFICE_LEAF;
ok(renderV4ReportFromRow(row) === off, "flip-back: flag-OFF render byte-identical");

console.log(fails === 0 ? "\n✅ ALL GREEN — F-4 office-leaf + F-5 coverage coherence" : `\n❌ ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
