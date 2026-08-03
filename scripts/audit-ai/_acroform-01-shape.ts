// $0. Two questions, before any design:
//  Q1 does the hand-built fixture parse at all, and does getText() reproduce the defect (labels yes, values no)?
//  Q2 what does pdfjs getFieldObjects() ACTUALLY return — shape, keys, how a checkbox differs from a text field?
import { buildAcroFormPdf, SF30_LABELS, SF30_FIELDS } from "../../src/lib/acroform-fixture";
import { extractText } from "../../src/lib/pdf-text-extractor";

(async () => {
  const buf = buildAcroFormPdf(SF30_LABELS, SF30_FIELDS);
  console.log(`fixture: ${buf.length} bytes, magic=${buf.subarray(0, 8).toString("latin1")}`);

  const out = await extractText(buf);
  console.log(`\n=== Q1: extractText → method=${out.extractionMethod} pages=${out.pageCount} rawLen=${out.rawText.length}`);
  console.log("--- rawText ---\n" + out.rawText.split("\n").map((l) => "  | " + l).join("\n"));
  console.log("\n  LABEL present? ", out.rawText.includes("14. DESCRIPTION OF AMENDMENT/MODIFICATION"));
  for (const f of SF30_FIELDS.filter((f) => f.value && !f.checkbox)) {
    console.log(`  VALUE "${f.value.slice(0, 34)}" present? `, out.rawText.includes(f.value));
  }

  console.log("\n=== Q2: raw getFieldObjects() ===");
  const mod: any = require("pdf-parse");
  const Ctor = mod?.PDFParse ?? mod?.default ?? mod;
  const inst = new Ctor({ data: buf });
  await inst.getText();
  const doc = (inst as any).doc;
  console.log("  inst.doc present:", !!doc, "· getFieldObjects is fn:", typeof doc?.getFieldObjects === "function");
  if (typeof doc?.getFieldObjects === "function") {
    const fo = await doc.getFieldObjects();
    console.log("  returns:", fo === null ? "null" : `object with ${Object.keys(fo).length} key(s)`);
    console.log(JSON.stringify(fo, null, 1).slice(0, 2600));
  }
  await inst.destroy?.();
})();
