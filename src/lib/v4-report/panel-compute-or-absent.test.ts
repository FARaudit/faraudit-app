// $0 regression lock for REPORT-TRUTH #3 — the §L / §M / CLIN panels asserted structure they never computed.
// Run: npx tsx src/lib/v4-report/panel-compute-or-absent.test.ts
//
// WHAT BROKE (live run 95698f91, 2026-07-30). Two defects in one place:
//
//  (1) FABRICATION. buildClins took the CLIN number from `/\b(\d{4})\b/` over finding PROSE. Run against that run's
//      real findings it produced "1810" (the street number of 1810 Jefferson Blvd, three times), "2026" from dates,
//      "1984" from a FAR reference, and "7012"/"7008"/"7003"/"7004" — the SUFFIXES OF DFARS CLAUSE NUMBERS such as
//      252.204-7012 — each rendered to the customer as a contract line item.
//
//  (2) UNCOMPUTED DEFAULTS. `vol`, `basis`, `type`, `qtyUnit`, `period` were emitted as "" and the renderer drew a
//      column header over each. FindingLite carries no field for any of them, so nothing ever computed them — an
//      empty cell under a printed header tells the reader "we looked and the solicitation says nothing", which the
//      engine never established. Compute-or-absent: omit, and drop the column.
export {};

process.env.AUDIT_PANEL_COMPUTE_OR_ABSENT = "true";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { buildV4Data } = await import("./build-data");
  const { renderRichWeb } = await import("./render");
  const render = (d: unknown) => renderRichWeb(d as never).html;

  // Real finding prose from run 95698f91 — the exact strings the scrape mined for CLIN numbers.
  const F = (requirement: string, citation: string) => ({ requirement, citation, disposition: "gate_to_clear", kind: "clin", severity: "P1" });
  const rowFor = (reqs: Array<[string, string]>) => {
    const audit = {
      id: "t", solicitation_number: "W9123826QA032", compliance_json: {
        engine: "agentic_v3", documents_complete: true,
        v3: {
          verdict: "BID_WITH_CAUTION", reason: "t", eligible: true, showStoppers: [],
          findings: reqs.map(([r, c]) => F(r, c)),
          coverage: { required: ["B"], covered: ["B"], missing: [] },
          documents: { reconciled: true, posted: 1, read: 1, complete: true, missing: [] },
        },
      },
    };
    return buildV4Data(audit as never);
  };

  // ---- 1. THE FABRICATIONS ARE GONE --------------------------------------------------------------------------
  const FABRICATORS: Array<[string, string, string]> = [
    ["1810 (street number)", "Place of performance is the US Army Corps of Engineers Valley Resident Office, 1810 Jefferson Blvd, Sacramento, CA 95833", "§B"],
    ["2026 (a year)", "Active SAM registration required (52.204-7 Deviation 2026-O0038)", "§B"],
    ["7012 (DFARS suffix)", "DFARS 252.204-7012 Safeguarding Covered Defense Information is incorporated by reference", "§B"],
    ["1984 (FAR reference)", "A site visit provision (52.237-1) is incorporated by reference", "§B"],
  ];
  for (const [label, req, cite] of FABRICATORS) {
    const d = rowFor([[req, cite]]);
    const clins = d.clins as { grounded: boolean; rows?: Array<{ clin?: string }> };
    const emitted = clins.rows?.[0]?.clin;
    ok(`no CLIN invented from ${label}`, emitted === undefined);
  }

  // ---- 2. FALSIFICATION: a REAL anchored CLIN must still be captured ------------------------------------------
  // Without this, deleting the scrape entirely would pass every assertion above.
  const REAL: Array<[string, string]> = [
    ["Pre-Work Meeting (CLIN 0006) must be priced as a separate FFP line item", "0006"],
    ["Firm Fixed Price required for CLINs 0001-0006 (base) and option CLINs 1001-4005", "0001"],
    ["Item No. 0002 covers quarterly tree trimming for the base period", "0002"],
    ["LINE ITEM 4005 is the final option-year mowing requirement", "4005"],
  ];
  for (const [req, expected] of REAL) {
    const d = rowFor([[req, "§B"]]);
    const got = (d.clins as { rows?: Array<{ clin?: string }> }).rows?.[0]?.clin;
    ok(`anchored CLIN ${expected} IS captured from "${req.slice(0, 40)}…"`, got === expected);
  }

  // ---- 3. UNCOMPUTED ATTRIBUTES ARE OMITTED, NOT EMPTIED -------------------------------------------------------
  const d3 = rowFor([["Pre-Work Meeting (CLIN 0006) must be priced separately", "§B"]]);
  const r3 = (d3.clins as { rows: Array<Record<string, unknown>> }).rows[0];
  for (const k of ["type", "qtyUnit", "period"]) {
    ok(`clin row omits '${k}' (never computed) rather than sending ""`, !(k in r3));
  }

  // ---- 4. THE COLUMN DOES NOT RENDER --------------------------------------------------------------------------
  // The payload being honest is not enough — a header printed over blanks is the defect the customer actually sees.
  const html = render(d3);
  ok("rendered CLIN table has no Type column", !/<th>Type<\/th>/.test(html));
  ok("rendered CLIN table has no Qty / unit column", !/<th>Qty \/ unit<\/th>/.test(html));
  ok("rendered CLIN table has no Period column", !/<th>Period<\/th>/.test(html));
  ok("rendered CLIN table KEEPS the columns it computed", /<th>CLIN<\/th>/.test(html) && /<th>Title<\/th>/.test(html));

  // A package with NO anchored CLIN anywhere must drop the CLIN column too — not print an empty one.
  const d4 = rowFor([["Place of performance is 1810 Jefferson Blvd, Sacramento, CA 95833", "§B"]]);
  const html4 = render(d4);
  ok("no anchored CLIN anywhere ⇒ the CLIN column is dropped whole", !/<th>CLIN<\/th>/.test(html4));
  ok("…and 1810 appears nowhere as a line-item number", !/<td class="cl-n mono">1810<\/td>/.test(html4));

  console.log(`\nREPORT-TRUTH #3 · panel compute-or-absent: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
