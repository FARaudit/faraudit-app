// A minimal, hand-built AcroForm PDF — the fixture for the form-field recovery suite.
//
// WHY BUILD ONE INSTEAD OF COMMITTING A REAL SF-30. The real specimens are government solicitation PDFs that
// live outside this (public) repository, and a suite that needs an untracked binary is a suite that silently
// skips everywhere but one laptop — the failure `corpus-fixture.ts` exists to prevent. This builder reproduces
// the EXACT defect structure instead: the page's CONTENT STREAM carries only the printed labels, and the typed
// answers exist only as /V entries on AcroForm field objects. Extracting text from it therefore yields the
// labels and loses every value, which is what run eab43ada's two SF-30s do.
//
// Byte offsets for the xref table are COMPUTED, never counted by hand — a mis-stated offset produces a PDF that
// some readers repair silently and others reject, which would make the fixture the thing under test.

export interface FixtureField {
  /** Field name (/T). */
  name: string;
  /** Text value (/V) for a text field, or the on-state name for a checkbox. */
  value: string;
  /** Checkbox fields carry /AS as well, and their value is a NAME object, not a string. */
  checkbox?: boolean;
  /** Checkbox rendered state — when false the widget is /Off regardless of `value`. */
  checked?: boolean;
}

/**
 * Build a single-page PDF whose visible text is `labels` and whose only other content is an AcroForm carrying
 * `fields`. Returns the raw bytes.
 */
export function buildAcroFormPdf(labels: string[], fields: FixtureField[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // Object numbering: 1 catalog · 2 pages · 3 page · 4 font · 5 contents · 6.. field widgets.
  const FIELD_START = 6;
  const fieldRefs = fields.map((_, i) => `${FIELD_START + i} 0 R`);

  const contentLines = labels
    .map((l, i) => `BT /F1 10 Tf 40 ${740 - i * 16} Td (${esc(l)}) Tj ET`)
    .join("\n");
  const content = `${contentLines}\n`;

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${fieldRefs.join(" ")}] /DA (/Helv 0 Tf 0 g) >> >>`;
  objects[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objects[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> ` +
    `/Contents 5 0 R /Annots [${fieldRefs.join(" ")}] >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[5] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;

  fields.forEach((f, i) => {
    const n = FIELD_START + i;
    const rect = `[40 ${600 - i * 24} 300 ${618 - i * 24}]`;
    if (f.checkbox) {
      const on = `/${f.value}`;
      const as = f.checked ? on : "/Off";
      objects[n] =
        `<< /Type /Annot /Subtype /Widget /FT /Btn /T (${esc(f.name)}) /V ${f.checked ? on : "/Off"} /AS ${as} ` +
        `/Rect ${rect} /P 3 0 R /F 4 >>`;
    } else {
      objects[n] =
        `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${esc(f.name)}) /V (${esc(f.value)}) ` +
        `/Rect ${rect} /P 3 0 R /F 4 /DA (/Helv 10 Tf 0 g) >>`;
    }
  });

  // Serialise, recording each object's byte offset as we go.
  const header = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  let body = "";
  const offsets: number[] = [];
  const count = FIELD_START + fields.length; // highest object number
  for (let n = 1; n <= count; n++) {
    offsets[n] = header.length + body.length;
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }

  const xrefStart = header.length + body.length;
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= count; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}

/** The SF-30 shape, reduced to its essentials: printed labels with no values, and the two checkbox rows whose
 *  BOTH options print as text — which is the state that makes a bare SF-30 unreadable today. */
export const SF30_LABELS = [
  "2. AMENDMENT/MODIFICATION NUMBER 3. EFFECTIVE DATE",
  "9A. AMENDMENT OF SOLICITATION NUMBER",
  "The hour and date specified for receipt of Offers is extended. is not extended.",
  "E. IMPORTANT: Contractor is not is required to sign this document and return copies to the issuing office.",
  "14. DESCRIPTION OF AMENDMENT/MODIFICATION",
];

export const SF30_FIELDS: FixtureField[] = [
  { name: "AmendmentNumber", value: "0001" },
  { name: "EffectiveDate", value: "06 Aug 2026" },
  { name: "SolicitationNumber", value: "W50S6U26QA019" },
  { name: "OffersExtended", value: "Yes", checkbox: true, checked: true },
  { name: "ContractorMustSign", value: "Yes", checkbox: true, checked: false },
  { name: "Block14Description", value: "Response Due Date changed from 30 Jul 2026 to 06 Aug 2026." },
  { name: "EmptyOnPurpose", value: "" },
];
