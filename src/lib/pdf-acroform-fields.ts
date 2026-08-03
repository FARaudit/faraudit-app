// ACROFORM FIELD RECOVERY — flag AUDIT_INGEST_ACROFORM_FIELDS, default OFF (flag-off ⇒ byte-identical).
//
// THE DEFECT, measured on run eab43ada (W50S6U26QA019). Page 1 of both SF-30 amendments extracts as 100%
// preprinted template. All eleven field LABELS survive — "2. AMENDMENT/MODIFICATION NUMBER", "3. EFFECTIVE
// DATE", "9A. AMENDMENT OF SOLICITATION NUMBER" — and not one value. The reason is structural, not a tuning
// problem: a filled PDF form keeps its printed labels in the page CONTENT STREAM and its typed answers in
// AcroForm field dictionaries (/V). `getText()` reads the content stream. The values were never in the text
// layer, so no amount of extraction tuning recovers them.
//
// THE PART THAT IS WORSE THAN MISSING DATA. A checkbox row prints BOTH of its mutually exclusive options as
// ordinary text, and the tick lives in /AS. So the extracted source literally reads:
//     "The hour and date specified for receipt of Offers is extended. is not extended."
//     "E. IMPORTANT: Contractor is not is required to sign this document"
// A lens reading that sees both branches asserted and no way to choose. This is not blindness — it is an
// invitation to be confidently wrong about whether a deadline moved. Recovering /AS is the point of this
// module more than recovering the text fields is.
//
// GROUNDING DISCIPLINE. The emitted block is appended to the document text and therefore becomes something
// Rule 64 will ground verbatim excerpts against, so every character of a VALUE is the document's own. In
// particular a checkbox is emitted with the PDF's literal state name ("Off", "Yes", "1", whatever the form
// used) and NOT with an invented word like "CHECKED" — a lens quoting the line quotes document truth. The
// only authored text is the block header, which states the convention so the reader is not guessing at it.
// Same principle as pdf-displaced-run-repair.ts: never manufacture a string and then let it be quoted as source.
//
// Deterministic, $0, no model call.

/** The subset of a pdfjs field object this module relies on. pdfjs returns a good deal more; naming only what
 *  is used keeps the coupling visible if the upstream shape moves. */
interface PdfjsFieldObject {
  name?: string;
  value?: unknown;
  type?: string;
  page?: number;
  rect?: number[];
  hidden?: boolean;
}

/** Anything exposing pdfjs's document-level AcroForm accessor. Structural, so the caller can hand us the
 *  document proxy pdf-parse already loaded rather than resolving a second copy of pdfjs. */
export interface FieldObjectSource {
  getFieldObjects?: () => Promise<Record<string, unknown[]> | null>;
}

export interface RecoveredField {
  name: string;
  value: string;
  type: string;
  page: number;
  /** True when `type` is a checkbox/radio and the state is anything other than the PDF's "Off". */
  checked?: boolean;
}

export interface AcroFormResult {
  fields: RecoveredField[];
  /** Rendered block ready to append to the document text; "" when there is nothing to add. */
  block: string;
  /** Set when recovery could not run. Never throws — an absent form is normal, not an error. */
  refused?: string;
}

export const ACROFORM_BLOCK_HEADER =
  "==== FORM FIELD VALUES (AcroForm) ====\n" +
  "// Values below are stored in the PDF's form fields, not printed on the page, so page text alone omits them.\n" +
  "// Checkbox and radio states are the PDF's own state names: \"Off\" means NOT selected; any other value means selected.\n";

const isCheckable = (t: string) => t === "checkbox" || t === "radiobutton";

/** Read the AcroForm field values out of an already-loaded pdfjs document.
 *
 *  Never throws. A PDF with no form returns `{ fields: [], block: "" }` — the overwhelmingly common case, and
 *  not a failure. A source that cannot answer at all returns `refused`, so telemetry can tell "this document
 *  has no form" apart from "we could not look", which are very different facts about a solicitation. */
export async function recoverAcroFormFields(source: FieldObjectSource | null | undefined): Promise<AcroFormResult> {
  if (!source || typeof source.getFieldObjects !== "function") {
    return { fields: [], block: "", refused: "no pdfjs document available — field objects were not queried" };
  }

  let raw: Record<string, unknown[]> | null;
  try {
    raw = await source.getFieldObjects();
  } catch (err) {
    return { fields: [], block: "", refused: `getFieldObjects threw: ${(err as Error).message}` };
  }
  if (!raw) return { fields: [], block: "" }; // no AcroForm at all — normal

  // The rect rides ALONG with each recovered field rather than being re-derived in a second pass. An earlier
  // draft filtered twice and paired the two passes by a running index — which is correct only for as long as
  // both copies of the filter stay identical, and silently mis-pairs every field after the first divergence.
  const collected: Array<RecoveredField & { rect?: number[] }> = [];
  for (const [key, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const f = e as PdfjsFieldObject;
      const type = String(f.type ?? "");
      // A value can legitimately be a number or boolean; normalise without inventing one.
      const value = f.value === null || f.value === undefined ? "" : String(f.value);
      // An EMPTY field says nothing and would only dilute the block. An "Off" checkbox, by contrast, is a real
      // answer — it is how the form records "this option was NOT selected" — so it is kept.
      if (!value && !isCheckable(type)) continue;
      if (f.hidden) continue;
      collected.push({
        name: String(f.name ?? key),
        value,
        type: type || "unknown",
        page: typeof f.page === "number" ? f.page : 0,
        ...(isCheckable(type) ? { checked: value !== "" && value !== "Off" } : {}),
        rect: Array.isArray(f.rect) ? f.rect : undefined,
      });
    }
  }

  if (!collected.length) return { fields: [], block: "" };

  // Document order: by page, then top-down (PDF y grows upward, so descending), then left-to-right. A lens has
  // to pair each value with the label printed beside it, and reading order is the only cue we can give it.
  collected.sort((a, b) =>
    a.page - b.page ||
    (b.rect?.[3] ?? 0) - (a.rect?.[3] ?? 0) ||
    ((a.rect?.[0] ?? 0) - (b.rect?.[0] ?? 0)) ||
    a.name.localeCompare(b.name)
  );
  const fields: RecoveredField[] = collected.map(({ rect: _rect, ...f }) => f);

  const lines = fields.map((f) => {
    const tag = isCheckable(f.type) ? ` [${f.type}]` : "";
    return `[page ${f.page + 1}] ${f.name}${tag} = ${f.value === "" ? "(empty)" : f.value}`;
  });
  return { fields, block: `\n\n${ACROFORM_BLOCK_HEADER}${lines.join("\n")}\n` };
}
