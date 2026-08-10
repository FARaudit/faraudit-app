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
import { deflateSync } from "node:zlib";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Packer } from "docx";
import React from "react";
import { CapDoc, type CapStmt } from "@/lib/capability-statement-pdf-doc";
import { buildDocx } from "@/lib/capability-statement-docx-doc";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { naicsLines } from "@/lib/capability-statement-naics";
import { agencyOptions, orderForAgency, resolveAgency } from "@/lib/capability-statement-tailoring";
import { sniffImageType, imageSize, fitWithin, LOGO_BOX } from "@/lib/capability-statement-logo";

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

  console.log("\n── the logo is sized by its own dimensions ──");
  {
    // A REAL PNG, built here: 1024x1024, the shape of the favicon that filled a page.
    // Only the IHDR matters for sizing, so the rest is a minimal valid chunk stream.
    const crc = (buf: Buffer) => {
      let c = ~0;
      for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
      return (~c) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, c]);
    };
    // TWO FIXTURES, for two different jobs. `square` is a 1024x1024 HEADER — the shape of
    // the favicon that filled a page — used only for the sizing maths; its pixel data is
    // not valid and it is never rendered. `real` is a genuinely decodable PNG, small
    // enough to build here, used wherever a renderer will actually decode the image. The
    // first version used the invalid one for both and crashed the suite inside
    // react-pdf's decoder, which is not the same thing as a failing assertion.
    const png = (w: number, h: number, pixels: Buffer | null) => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8; ihdr[9] = 6;
      const idat = pixels
        ? deflateSync(pixels)
        : Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))
      ]);
    };
    const square = png(1024, 1024, null);
    const W = 8, H = 4;
    const scanlines = Buffer.concat(
      Array.from({ length: H }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(W * 4, 0x40)]))
    );
    const real = png(W, H, scanlines);

    check("a PNG's dimensions are read", JSON.stringify(imageSize(square)) === '{"width":1024,"height":1024}',
      "without the intrinsic size there is nothing to scale against");
    const box = fitWithin(imageSize(square), LOGO_BOX.width, LOGO_BOX.height);
    check("a square logo is capped by height", box.height === LOGO_BOX.height && box.width === LOGO_BOX.height,
      `got ${box.width}x${box.height} — a 1024px favicon reached the document at natural size`);
    check("a small logo is never enlarged",
      fitWithin({ width: 20, height: 10 }, LOGO_BOX.width, LOGO_BOX.height).height === 10,
      "a small mark was stretched into a blurry banner");
    check("a wide logo is capped by width",
      fitWithin({ width: 2000, height: 100 }, LOGO_BOX.width, LOGO_BOX.height).width === LOGO_BOX.width);
    check("an unreadable image falls back to the box height",
      fitWithin(null, LOGO_BOX.width, LOGO_BOX.height).height === LOGO_BOX.height);

    let pdfWithLogo: Buffer | null = null;
    try { pdfWithLogo = await pdf(FIXTURE, null, real); } catch { /* reported below */ }
    check("the PDF renders with a logo", !!pdfWithLogo && isPdf(pdfWithLogo),
      "the download fails when a logo is set");

    let docxWithLogo: Buffer | null = null;
    let derr = "";
    try { docxWithLogo = await Packer.toBuffer(buildDocx(FIXTURE, null, real)); } catch (e) { derr = (e as Error).message; }
    check("the Word export renders with a logo", !!docxWithLogo && isZip(docxWithLogo), derr);
    check("the Word export actually embeds it",
      !!docxWithLogo && docxWithLogo.toString("latin1").includes("word/media/"),
      "the logo was never carried into the Word builder — it was missing entirely until 2026-08-09");
    check("a logo makes the Word file bigger",
      !!docxWithLogo && docxWithLogo.byteLength > (await Packer.toBuffer(buildDocx(FIXTURE, null, null))).byteLength,
      "the image is not in the package");
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

  // ── STRUCTURED SECTIONS, READ OUT OF THE RENDERED PDF ─────────────────────────────────
  // The competency card has four fields and the prose column carries one, which is why the
  // structured columns exist. Asserting that the renderer "uses the resolver" would prove a
  // call, not a document — so this reads the text back out of the PDF the customer receives.
  {
    console.log("\n── structured sections reach the document ──");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("pdf-parse");
    const Ctor = mod?.PDFParse ?? mod?.default ?? mod;
    const textOf = async (b: Buffer): Promise<string> => {
      const r = typeof Ctor === "function" && Ctor.prototype?.getText
        ? await new Ctor({ data: new Uint8Array(b) }).getText()
        : await Ctor(b);
      return String(r?.text ?? "").replace(/\s+/g, " ");
    };
    // The eyebrows are letter-spaced, so pdf-parse returns "C O R E  C O M P E T E N C I E S".
    // Matching /CORE\s*COMPETENCIES/ never fires — which silently makes the NEGATIVE assertion
    // below ("prints no heading") pass whatever the document contains. Strip whitespace before
    // testing a heading so the absence check can actually fail.
    const hasHeading = (text: string, heading: string) =>
      text.replace(/\s+/g, "").toUpperCase().includes(heading.replace(/\s+/g, "").toUpperCase());

    const structured: CapStmt = {
      ...SPARSE,
      core_competencies: "PROSE THAT MUST NOT APPEAR",
      core_competencies_json: [
        { k: "Machining", h: "5-axis titanium details", b: "Build-to-print from OEM drawings.", s: "AS9102 first article" },
        { k: "Sustainment", h: "Qualified second source", b: "Spares against national stock numbers.", s: "Small lots standard" },
        { k: "Legacy", h: "Reverse engineering", b: "Dimensional capture when the source is gone.", s: "Drawing reconstruction" }
      ],
      differentiators_json: [{ h: "Quotes inside a short RFQ window", b: "No capture team in the path." }]
    };
    const t = await textOf(await pdf(structured, null));
    check("the kicker reaches the PDF", t.includes("Machining"), "cap-t is dropped in the render");
    check("the head reaches the PDF", t.includes("5-axis titanium details"));
    check("the body reaches the PDF", t.includes("Build-to-print from OEM drawings."),
      "the field prose could never carry is lost on the way to the document");
    check("the spec line reaches the PDF", t.includes("AS9102 first article"));
    check("all three competencies render", t.includes("Reverse engineering") && t.includes("Qualified second source"));
    check("the differentiator body renders", t.includes("No capture team in the path."));
    check("the superseded prose column is NOT printed", !t.includes("PROSE THAT MUST NOT APPEAR"),
      "both representations reach the document and the customer sees their old text twice");

    // structured-and-empty omits the heading; NULL falls back to prose. Collapsing these
    // either prints a heading over nothing or resurrects text the customer deleted.
    const emptied = await textOf(await pdf({ ...SPARSE, core_competencies: "Deleted", core_competencies_json: [] }, null));
    check("an empty structured section prints no heading", !hasHeading(emptied, "CORE COMPETENCIES"),
      "a heading over nothing is a claim about the firm");
    check("…and does not resurrect the prose column", !emptied.includes("Deleted"));

    const legacy = await textOf(await pdf({ ...SPARSE, core_competencies: "Precision machining\nSustainment" }, null));
    check("a legacy profile still renders its lines", legacy.includes("Precision machining") && legacy.includes("Sustainment"),
      "the structured path broke every profile written before it existed");
    check("a legacy profile still gets the heading", hasHeading(legacy, "CORE COMPETENCIES"));
    // The matcher must be able to SEE a heading, or the absence check above proves nothing.
    check("the heading matcher is not vacuous", hasHeading(t, "CORE COMPETENCIES"),
      "the absence assertion passes on every document, including one that has the heading");
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("SUITE CRASHED:", e); process.exit(1); });
