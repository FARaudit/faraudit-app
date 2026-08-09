// THE EXPORTS ARE RENDERED, NOT GREPPED.
//   npx tsx src/lib/capability-statement-exports.test.ts
//
// Every other check on this surface reads source text. That catches a deleted call and
// misses everything that only happens at render time: @react-pdf/renderer throwing on a
// style it no longer accepts, `docx` changing what it emits, a dependency upgrade
// breaking a builder. A route that returned 500 on every download stayed green across
// 243 passing assertions, because not one of them ever produced a document.
//
// WHAT THIS FILE DOES NOT DO, AND WHY. It does not read the text back out of the
// rendered PDF. Two attempts were made: scanning the raw buffer for `( … )` strings —
// which returned eight fragments of binary noise, because the content streams are
// FlateDecode — and then inflating the streams, which yielded 11 KB containing zero
// parenthesised strings, because react-pdf emits text as hex against subset fonts.
// Extracting it needs a real PDF parser.
//
// The first of those attempts reported nine failures and several passes. Every one was
// meaningless, and the failures read exactly like product defects. Rather than ship a
// text assertion that cannot see what it claims to check, the split is:
//
//   · the DOCUMENT is asserted to RENDER — every variant, valid container, no throw
//   · the CONTENT is asserted at the model layer, by executing the pure functions the
//     documents are built from
//
// That is where the defects actually lived. The phone bug was a formatter applied on two
// surfaces and not a third; it was never a layout problem.
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Packer } from "docx";
import React from "react";
import { CapDoc, type CapStmt } from "@/lib/capability-statement-pdf-doc";
import { buildDocx } from "@/lib/capability-statement-docx-doc";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { naicsLines } from "@/lib/capability-statement-naics";
import { agencyOptions, orderForAgency, resolveAgency } from "@/lib/capability-statement-tailoring";
import { sniffImageType } from "@/lib/capability-statement-logo";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// A FICTIONAL RECORD, DELIBERATELY. A packet fixture built from the CEO's own data has
// shipped before and passed review precisely because the data was real. 999999 is not a
// NAICS code, so it exercises the unknown-title path.
const FIXTURE: CapStmt = {
  company_name: "Northwind Precision Works, Inc.",
  logo_url: null,
  uei: "DEMOUEI1234X",
  cage_code: "9ZZ99",
  naics_codes: ["332710", "336412", "999999"],
  certifications: ["SDVOSB", "HUBZone"],
  core_competencies: "Precision machining and sustainment for rotary- and fixed-wing platforms.",
  differentiators: "Average 6-day quote turnaround. In-house CMM inspection.",
  contact_name: "Dana Whitfield",
  contact_email: "dana@northwind.example",
  contact_phone: "12035550142",
  contact_website: "https://northwind.example",
  contact_address: "482 Foundry Rd, Bridgeport CT 06605",
  past_performance: Array.from({ length: 9 }, (_, i) => ({
    notice_id: `DEMO${i}-26-R-100${i}`,
    title: `Award ${i + 1}`,
    agency: i % 3 === 0 ? "DEPT OF THE NAVY" : "DEFENSE LOGISTICS AGENCY",
    naics_code: "332710",
    contract_value: null,
    period: "2026-2028"
  }))
};

const SPARSE: CapStmt = {
  company_name: "Sparse Co", naics_codes: [], certifications: [], past_performance: []
};

const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const isZip = (b: Buffer) => b.subarray(0, 2).toString("latin1") === "PK";

async function pdf(stmt: CapStmt, agency: string | null, logo: Buffer | null = null): Promise<Buffer> {
  const el = React.createElement(CapDoc, { stmt, generatedAt: "2026-08-09", logo, agency }) as unknown as React.ReactElement<DocumentProps>;
  return renderToBuffer(el);
}

async function main() {
  console.log("── every PDF variant renders ──");
  for (const [what, stmt, agency, logo] of [
    ["a populated record", FIXTURE, null, null],
    ["a tailored edition", FIXTURE, "DEPT OF THE NAVY", null],
    ["an agency with no awards", FIXTURE, "DEPT OF THE INTERIOR", null],
    ["a bare record", SPARSE, null, null],
    ["a bare record, tailored", SPARSE, "DEPT OF THE NAVY", null]
  ] as Array<[string, CapStmt, string | null, Buffer | null]>) {
    let buf: Buffer | null = null;
    let err = "";
    try { buf = await pdf(stmt, agency, logo); } catch (e) { err = (e as Error).message; }
    check(`${what} produces a PDF`, !!buf && isPdf(buf) && buf.byteLength > 1000,
      err || `${buf?.byteLength ?? 0} bytes`);
  }

  console.log("\n── every Word variant renders ──");
  for (const [what, stmt, agency] of [
    ["a populated record", FIXTURE, null],
    ["a tailored edition", FIXTURE, "DEPT OF THE NAVY"],
    ["a bare record", SPARSE, null]
  ] as Array<[string, CapStmt, string | null]>) {
    let buf: Buffer | null = null;
    let err = "";
    try { buf = await Packer.toBuffer(buildDocx(stmt, agency)); } catch (e) { err = (e as Error).message; }
    check(`${what} produces a .docx`, !!buf && isZip(buf) && buf.byteLength > 1000,
      err || `${buf?.byteLength ?? 0} bytes`);
    if (buf) {
      const raw = buf.toString("latin1");
      check(`${what} carries word/document.xml`, raw.includes("word/document.xml"),
        "a ZIP that is not an OOXML document");
    }
  }

  console.log("\n── the content model, executed ──");
  {
    // The phone defect: one field, two renderings, and the raw one reached a CO.
    check("a leading country code is dropped", formatPhone("12035550142") === "(203) 555-0142");
    check("a plain ten digits formats", formatPhone("2035550142") === "(203) 555-0142");
    check("an extension is untouched", formatPhone("203-555-0142 x22") === "203-555-0142 x22");
    check("empty stays empty", formatPhone(null) === "" && formatPhone("") === "");

    const lines = naicsLines(FIXTURE.naics_codes);
    check("one line per code", lines.length === 3);
    check("the first is primary", lines[0].primary && !lines[1].primary);
    check("a known code carries its title", lines[0].title === "Machine Shops");
    check("an unknown code has no title", lines[2].code === "999999" && lines[2].title === null,
      "a code absent from 121.201 was given a guessed title");
    check("duplicates collapse", naicsLines(["332710", "332710"]).length === 1);
    check("a non-array yields nothing", naicsLines(null).length === 0);

    const opts = agencyOptions(FIXTURE.past_performance);
    check("agencies come from the awards", opts.length === 2);
    check("counted, not asserted", (opts.find((o) => o.agency === "DEPT OF THE NAVY")?.count ?? 0) === 3);
    check("an unrecorded agency is refused", resolveAgency(FIXTURE.past_performance, "DEPT OF THE INTERIOR") === null,
      "a query string could name a buyer the customer has no history with");
    check("a recorded agency resolves", resolveAgency(FIXTURE.past_performance, "dept of the navy") === "DEPT OF THE NAVY");

    const ordered = orderForAgency(FIXTURE.past_performance!, "DEPT OF THE NAVY");
    check("the edition reorders", ordered[0].agency === "DEPT OF THE NAVY");
    check("it never filters", ordered.length === FIXTURE.past_performance!.length,
      "the firm's own past performance was hidden from its own document");
    check("an unmatched agency leaves the order alone",
      orderForAgency(FIXTURE.past_performance!, "NASA")[0].title === "Award 1");
    check("the export limit is five", PAST_PERFORMANCE_EXPORT_LIMIT === 5);

    check("a PNG is recognised", sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))?.ext === "png");
    check("an SVG renamed .png is refused",
      sniffImageType(Uint8Array.from([...'<svg xmlns="'].map((c) => c.charCodeAt(0)))) === null);
  }

  console.log("\n── falsifiability ──");
  {
    check("P1 · the container check rejects a non-PDF", !isPdf(Buffer.from("<html>nope</html>")));
    check("P2 · the container check rejects a non-ZIP", !isZip(Buffer.from("%PDF-1.7")));
    // A builder that throws must FAIL, not be reported as an absent document.
    let threw = false;
    // react-pdf logs the component error to console.error on its way out. The throw is
    // the point of this check, so the library's noise is suppressed rather than left to
    // read like a crashed suite.
    const realError = console.error;
    console.error = () => {};
    try {
      const bad = React.createElement(CapDoc, { stmt: null as unknown as CapStmt, generatedAt: "x", logo: null, agency: null }) as unknown as React.ReactElement<DocumentProps>;
      await renderToBuffer(bad);
    }
    catch { threw = true; }
    finally { console.error = realError; }
    check("P3 · a builder given nothing throws rather than emitting a document", threw,
      "the render path swallows a broken record and produces a file anyway");
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("SUITE CRASHED:", e); process.exit(1); });
