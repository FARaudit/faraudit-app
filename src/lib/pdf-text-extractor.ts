// Component 1 — PDF Text Extractor (Cycle 2 document-extraction rebuild)
//
// Brain ruling 2026-06-07: facts come from the document, not from the model.
// This module is the deterministic text-extraction layer that feeds the
// section-boundary-detector. No LLM involvement; same input → same output.
//
// Used by: section-boundary-detector, audit-engine (after Session 2 wiring).

export interface PageText {
  pageNum: number;
  text: string;
  lines: string[];
}

import { ocrPdfToText, looksGarbled } from "./pdf-ocr";
import { isEnvOn } from "./env-flags";
import { scanOcrExcerpt, type ExcerptScan } from "./ocr-token-validation";
import { repairDisplacedRuns } from "./pdf-displaced-run-repair";
import { recoverAcroFormFields, type FieldObjectSource } from "./pdf-acroform-fields";

export interface ExtractedDocument {
  pages: PageText[];
  rawText: string;
  pageCount: number;
  extractionMethod: "pdf-parse" | "pdfjs" | "ocr" | "fallback";
  warnings: string[];
  // FA-INGEST (2026-07-06) — a multi-page doc whose extractable text sits on
  // only a MINORITY of pages is a mixed cover(text)+body(scanned) document: the
  // readable cover clears the whole-doc text floor and MASKS a scanned body the
  // text-only engine never receives. True here → the completeness contract must
  // read the doc as content-loss (honest INCOMPLETE), NOT green off the cover
  // text alone (see hasEngineText consumers in sam-attachments). Only ever set
  // from reliable per-page structure (pdf-parse v2 pages[]); OCR-recovered and
  // single-block reads leave it undefined (falsy).
  partialPageText?: boolean;
  // Lever-3 STEP-2 OCR-accuracy gate (layer-2). Set ONLY when extractionMethod==="ocr" — the deterministic
  // structural partition of the OCR text's decision-bearing tokens (suspect_misread vs format-valid residual).
  // Feeds the has_text completeness gate (fail-toward-NHR) + the executor's layer-3 vision confirmation. Undefined
  // for native/garbled-native reads (no OCR ⇒ no OCR-accuracy question). See ocr-accuracy-gate.ts.
  ocrScan?: ExcerptScan;
}

// Reliable per-page floor for the mixed cover+scanned detection above. A page
// under this many meaningful chars is treated as image-only (no readable text).
const MIN_PAGE_MEANINGFUL_CHARS = 10;

// Detect the mixed cover(text)+body(scanned) case from RELIABLE per-page text.
// Conservative by design — a false INCOMPLETE degrades UX, a false COMPLETE is
// catastrophic. T0-6 (engine line-audit 2026-07-06): the prior test fired ONLY on
// a STRICT scanned MAJORITY (withText*2 < pages.length), so a text cover + a scanned
// BODY that was merely HALF the doc (e.g. 2 text cover + 2 scanned body) cleared the
// whole-doc floor on the cover text and read COMPLETE while the scanned body was
// silently lost — a false-COMPLETE. Now flag at ≥ HALF no-text pages with a ≥2 floor:
// it catches a real scanned body (incl. the exactly-half case the strict-majority
// missed) while STILL tolerating an incidental blank signature/divider page (a single
// no-text page never trips it). OCR runs FIRST (partialFromPages → needsOcr) and
// CLEARS the flag when it recovers the body — this only rides through to has_text=false
// where OCR genuinely cannot (serverless / truly image-only body). Callers MUST only
// pass pages from real per-page extraction (pdf-parse v2) — buildPageStructure drops
// empty pages, so a form-feed/single-block split cannot be trusted here.
export function isPartialPageText(pages: PageText[]): boolean {
  if (pages.length < 3) return false;
  const withText = pages.filter((p) => meaningfulCharCount(p.text) >= MIN_PAGE_MEANINGFUL_CHARS).length;
  if (withText === 0) return false; // whole-doc scan — the whole-doc meaningful-chars floor governs, not this per-page test
  const noText = pages.length - withText;
  return noText >= 2 && noText * 2 >= pages.length;
}

// SINGLE SOURCE OF TRUTH for the text-vs-vision delivery decision (2026-06-21).
// A doc with at least this many MEANINGFUL extracted chars rides as a TEXT block
// (~text cost); below it it's treated as image-only and delivered as base64-PDF
// VISION. Both the engine (textForDocOrNull) and the assembly page budget
// (isTextDeliverable) MUST use these so the two decisions can never drift — a doc
// page-exempted in one place but delivered as vision in the other would silently
// re-break the FA-INGEST page-budget fix.
export const MIN_TEXT_CHARS_FOR_TEXT_BLOCK = 200;

// Meaningful-char measure: strip page-separator padding lines ("-- 3 of 50 --")
// that an image scan emits but carry no content.
export function meaningfulCharCount(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[\s\-–—=_·.*]*(?:page\s*)?\d+\s*(?:of|\/)\s*\d+[\s\-–—=_·.*]*$/i.test(l))
    .join("\n").length;
}

export async function extractText(pdfBuffer: Buffer): Promise<ExtractedDocument> {
  const warnings: string[] = [];

  try {
    // BELT (2026-07-29, pairs with next.config serverExternalPackages): when @napi-rs/canvas is
    // unavailable (untraced serverless bundle, missing platform binary), pdfjs references
    // DOMMatrix at module init and the require below THREW — turning every PDF into an empty
    // placeholder and the audit into an honest INCOMPLETE. TEXT extraction needs the globals to
    // EXIST, not to render; a minimal stub keeps getText() alive. Node never defines DOMMatrix
    // before pdfjs loads canvas, so the presence check alone cannot gate the stub — probe canvas
    // itself: a try-require catches both an untraced bundle AND a resolvable package whose
    // platform binary fails to load. With canvas loadable, pdfjs installs its own real polyfills.
    const g = globalThis as Record<string, unknown>;
    let canvasLoadable = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@napi-rs/canvas");
    } catch {
      canvasLoadable = false;
    }
    if (!canvasLoadable) {
      if (typeof g.DOMMatrix === "undefined") {
        g.DOMMatrix = class DOMMatrixStub {
          a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
          constructor(init?: number[]) {
            if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          }
        };
        warnings.push("DOMMatrix stubbed — canvas package unavailable (text-only extraction)");
      }
      if (typeof g.ImageData === "undefined") g.ImageData = class ImageDataStub {};
      if (typeof g.Path2D === "undefined") g.Path2D = class Path2DStub {};
    }
    // pdf-parse@^2.x exports default differently than v1; handle both.
    // v2 exposes a class-based PDFParse with getText(); v1 exposes a callable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseMod = require("pdf-parse");
    const PdfParseCtor = pdfParseMod?.PDFParse ?? pdfParseMod?.default ?? pdfParseMod;
    // [PDF-DIAG] (2026-07-06, temporary) — the audit-worker container read ALL attachments
    // has_text=false while this exact commit extracts them fine locally. Every doc (PDF + docx-
    // via-wrapped-PDF) funnels through pdf-parse here, so this pins the container failure:
    // module-load vs wrong-shape vs empty-yield vs throw. Remove once the cause is fixed.
    console.error(`[PDF-DIAG] require pdf-parse: mod=${typeof pdfParseMod} ctor=${typeof PdfParseCtor} bytes=${pdfBuffer.length} magic=${pdfBuffer.subarray(0, 5).toString("latin1")}`);
    let rawText = "";
    let pageCount = 1;

    if (typeof PdfParseCtor === "function") {
      // pdf-parse v2 returns { pages: Array<{ text, num }>, text, total }
      // pdf-parse v1 returns { text, numpages, ... } from a callable
      // Dispatch on the PROTOTYPE, not by try/catch: the old shape swallowed the v2 path's real
      // error and then invoked the v2 CLASS as a function — the preview proof (2026-07-29)
      // surfaced only the mask ("Class constructors cannot be invoked without 'new'") while the
      // root cause stayed invisible. A masked root cause here is how the Vercel extraction
      // outage survived undiagnosed; never re-call as fallback, log and let the outer catch own it.
      let pagesArr: Array<{ text?: string; num?: number }> | null = null;
      let acroFormBlock = "";
      const isV2Class = typeof (PdfParseCtor as { prototype?: { getText?: unknown } }).prototype?.getText === "function";
      if (isV2Class) {
        try {
          const inst = new PdfParseCtor({ data: pdfBuffer });
          const out = await inst.getText();
          rawText = String(out?.text ?? "");
          if (Array.isArray(out?.pages)) pagesArr = out.pages;
          pageCount = Array.isArray(out?.pages) ? out.pages.length : Number(out?.numpages ?? 1);

          // ACROFORM RECOVERY (flag AUDIT_INGEST_ACROFORM_FIELDS, default OFF ⇒ byte-identical). Must happen
          // HERE, inside the branch that owns the loaded document: a filled form keeps its labels in the page
          // content stream and its answers in field dictionaries, so `out.text` structurally cannot contain
          // them. See pdf-acroform-fields.ts — the checkbox states matter more than the text values, because
          // both options of a checkbox row print as ordinary text and the tick lives only in /AS.
          //
          // We reuse the pdfjs document pdf-parse ALREADY loaded rather than resolving a second copy of pdfjs.
          // That is deliberate: a second module-resolution path is exactly what broke PDF extraction under
          // Vercel's serverless tracing before (the DOMMatrix outage), and this needs no second parse anyway.
          // `doc` is not part of pdf-parse's published surface, so it is probed structurally and every failure
          // degrades to "no block" rather than throwing — an absent form is the normal case, not an error.
          if (isEnvOn(process.env.AUDIT_INGEST_ACROFORM_FIELDS)) {
            const doc = (inst as { doc?: FieldObjectSource }).doc;
            const af = await recoverAcroFormFields(doc);
            if (af.refused) warnings.push(`ACROFORM_FIELDS: not recovered — ${af.refused}`);
            else if (af.fields.length) {
              acroFormBlock = af.block;
              const ticked = af.fields.filter((f) => f.checked !== undefined).length;
              warnings.push(`ACROFORM_FIELDS: recovered ${af.fields.length} form field value(s)${ticked ? `, incl. ${ticked} checkbox/radio state(s) that page text cannot express` : ""}.`);
            }
          }
        } catch (err) {
          console.error(`[PDF-DIAG] v2 getText THREW (original error, unmasked): ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
          throw err;
        }
      } else {
        const out = await PdfParseCtor(pdfBuffer);
        rawText = String(out?.text ?? "");
        pageCount = Number(out?.numpages ?? 1);
      }

      if (!Number.isFinite(pageCount) || pageCount < 1) pageCount = 1;
      // FA-131 — page-separator/padding lines ("-- 3 of 50 --") are extractor
      // artifacts, not document text. A pure image scan can emit hundreds of
      // chars of them and defeat the <50 threshold, so measure meaningful
      // chars with separator lines stripped.
      const meaningfulLength = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/^[\s\-–—=_·.*]*(?:page\s*)?\d+\s*(?:of|\/)\s*\d+[\s\-–—=_·.*]*$/i.test(l))
        .join("\n").length;
      if (!rawText || meaningfulLength < 50) {
        warnings.push(`LOW_TEXT_YIELD: extracted only ${meaningfulLength} meaningful chars (${rawText.length} raw) — possible scanned/image PDF`);
      }

      // Prefer v2 per-page structure when available; fall back to form-feed
      // split or single-block reconstruction.
      const pages = pagesArr
        ? pagesArr.map((p, i) => {
            const text = String(p?.text ?? "").trim();
            return {
              pageNum: Number(p?.num ?? i + 1),
              text,
              lines: text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0),
            };
          })
        : buildPageStructure(rawText, pageCount);

      // Mixed cover(text)+body(scanned) detection — ONLY from pdf-parse's real
      // per-page text (pagesArr). buildPageStructure drops empty pages, so its
      // pages[] can't expose the scanned gaps and must not be trusted here.
      const partialFromPages = pagesArr ? isPartialPageText(pages) : false;

      // Stage-2 parse-tier OCR fallback (2026-06-22). The native layer is either
      // MISSING (true scan → low meaningful chars) or GARBLED (present but
      // unreadable font/encoding junk — N4008526R0065's CBA). In both cases OCR
      // recovers clean text for ~$0, removing the Opus-vision dependency. OCR is
      // attempted ONLY when needed, used ONLY when it's genuinely better, and is a
      // graceful no-op where the OCR binary is absent (e.g. serverless).
      // partialFromPages ALSO triggers OCR: a mixed cover+scanned doc clears the
      // whole-doc floor (cover text) so the first two conditions miss it, but its
      // scanned body still needs OCR to recover. Where OCR is a no-op (serverless,
      // binary absent) the flag rides through on the return below → honest INCOMPLETE.
      // Lever-3 STEP-2 (flag AUDIT_WORKER_OCR, default OFF → byte-identical): gate the OCR invocation so INSTALLING the
      // worker OCR binary (nixpacks) does NOT auto-activate OCR for every scanned doc — activation is a deliberate flag
      // flip after the OCR-accuracy Gauntlet clears. Flag OFF ⇒ ocrPdfToText never called ⇒ identical to today (where
      // the binary was absent and OCR no-op'd anyway); the partialFromPages content-loss warning below still fires.
      const needsOcr = meaningfulLength < MIN_TEXT_CHARS_FOR_TEXT_BLOCK || looksGarbled(rawText) || partialFromPages;
      if (needsOcr) { // AUDIT_WORKER_OCR retired 2026-08-20 — true on both surfaces
        const ocrText = await ocrPdfToText(pdfBuffer);
        // [OCR-DIAG] (Brain card #419 step 4 — close the wage-det telemetry gap). Log the OCR outcome for EVERY
        // OCR-attempted doc: did OCR fire, what did it yield, was it garbled, and (on accept) the gate partition.
        // Without this, an image-only content-loss doc (the FA8137 Wage-Det) gave no evidence of whether OCR ran,
        // failed, or was gate-held. Only emits under the flag (the OCR path), so flag-OFF stays byte-identical.
        const ocrYield = ocrText ? meaningfulCharCount(ocrText) : 0;
        const ocrGarbled = ocrText ? looksGarbled(ocrText) : false;
        if (ocrText && meaningfulCharCount(ocrText) > meaningfulLength && !looksGarbled(ocrText)) {
          warnings.push(
            `OCR parse-tier applied: native text was ${looksGarbled(rawText) ? "garbled" : "missing"} (${meaningfulLength} meaningful chars) → recovered ${meaningfulCharCount(ocrText)} clean chars via self-host OCR.`
          );
          // Layer-2 (OCR-accuracy gate): deterministically partition the recovered text's decision-bearing tokens
          // so the completeness gate can fail-toward-NHR on a caught misread / unconfirmed residual (see
          // ocr-accuracy-gate.ts). Runs ONLY on OCR-recovered text — this is where an OCR misread can enter.
          const ocrScan = scanOcrExcerpt(ocrText);
          if (ocrScan.suspect.length > 0 || ocrScan.validUnverified.length > 0) {
            warnings.push(
              `OCR-ACCURACY-GATE: ${ocrScan.suspect.length} caught misread(s) + ${ocrScan.validUnverified.length} format-valid residual token(s) — pending fail-toward-NHR unless confirmed.`
            );
          }
          console.error(`[OCR-DIAG] bytes=${pdfBuffer.length} OCR ACCEPTED: native=${meaningfulLength} → ocr=${ocrYield} chars · suspect=${ocrScan.suspect.length} residual=${ocrScan.validUnverified.length}`);
          return {
            pages: buildPageStructure(ocrText, pageCount),
            rawText: ocrText,
            pageCount,
            extractionMethod: "ocr",
            warnings,
            ocrScan,
          };
        }
        // OCR was attempted but NOT used — the wage-det telemetry gap. Log WHY so a content-loss doc is evidenced,
        // not silent: null (OCR failed/timed-out/binary-absent), garbled OCR (rejected), or not-better-than-native.
        console.error(`[OCR-DIAG] bytes=${pdfBuffer.length} OCR NOT USED: native=${meaningfulLength} ocr=${ocrText ? ocrYield : "null"} garbled=${ocrGarbled} → doc stays image-only/content-loss`);
      }

      // Reached here means OCR did NOT recover (fits-under-floor whole read, or
      // OCR was a no-op / not better). If per-page text was partial, the scanned
      // body is genuinely lost — surface it so the completeness contract reads
      // content-loss instead of green off the cover.
      if (partialFromPages) {
        const withText = pages.filter((p) => meaningfulCharCount(p.text) >= MIN_PAGE_MEANINGFUL_CHARS).length;
        warnings.push(`PARTIAL_PAGE_TEXT: extractable text on only ${withText}/${pages.length} pages — likely a mixed cover+scanned PDF; the image-only body was not recovered (OCR unavailable) and is treated as content loss.`);
      }
      // DISPLACED-RUN REPAIR (flag AUDIT_INGEST_DISPLACED_RUN, default OFF ⇒ byte-identical). pdf-parse emits a
      // styled run that is horizontally far from its neighbour AFTER the text it interrupts, marking the gap with
      // its `cellSeparator` ("\t"). On FAR clause PDFs that interpolates the paragraph heading into the middle of
      // the sentence it introduces, severing subject from predicate across a newline — measured 49 times in one
      // region of run eab43ada, and the reason a Government debriefing duty was published as a bidder gate. See
      // pdf-displaced-run-repair.ts for the mechanism and for why the run is relocated rather than re-inserted.
      //
      // Applied PER PAGE as well as to rawText: a displacement never spans a page boundary, and repairing only
      // rawText would leave pages[] disagreeing with it — the two are read by different downstream stages.
      // NOT applied on the OCR path above: OCR text has no cell separators and a different failure mode entirely.
      rawText = healDisplacedRuns(pages, rawText, warnings);

      // Appended AFTER the displaced-run repair so that repair only ever sees real extracted text, never a
      // block we composed. rawText ONLY, deliberately: the attachment ingest that assembles the per-document
      // regions reads `extracted.rawText` (sam-attachments.ts:1033), while `pages[]` carries page STRUCTURE
      // used for page budgeting and section detection. Form values belong to the document, not to a page, and
      // pushing them into pages[] would distort both counts and any whole-document reconstruction that
      // concatenates pages — the same content would appear twice.
      if (acroFormBlock) rawText += acroFormBlock;

      // [PDF-DIAG] (#157) — the live worker success probe; keep it after the partial-page
      // warning so the log line carries that warning too.
      console.error(`[PDF-DIAG] extractText OK: method=pdf-parse pages=${pageCount} rawLen=${rawText.length} meaningful=${meaningfulLength}${warnings.length ? ` warnings=[${warnings.join(" | ")}]` : ""}`);
      return { pages, rawText, pageCount, extractionMethod: "pdf-parse", warnings, partialPageText: partialFromPages };
    }
    throw new Error("pdf-parse module did not export a usable parser");
  } catch (err) {
    // [PDF-DIAG] — surface the swallowed failure in the worker logs (the pushed warning alone did
    // not print). "Cannot find module 'pdf-parse'" here would confirm the devDep pruned at runtime.
    console.error(`[PDF-DIAG] extractText THREW → empty placeholder: ${(err as Error).message}\n${(err as Error).stack}`);
    warnings.push(`pdf-parse failed: ${(err as Error).message}`);
  }

  // Fail-loud fallback — never silently emit nothing.
  warnings.push("All PDF parsers failed — returning empty placeholder. Downstream must treat as missing.");
  const placeholder = `[PDF_EXTRACTION_FAILED: ${pdfBuffer.length} bytes received]`;
  return {
    pages: [{ pageNum: 1, text: placeholder, lines: [placeholder] }],
    rawText: placeholder,
    pageCount: 0,
    extractionMethod: "fallback",
    warnings,
  };
}

/**
 * The displaced-run seam, EXPORTED so a suite can exercise the production path rather than a copy of it.
 *
 * A module-level unit test of `repairDisplacedRuns` proves the recogniser is right and proves NOTHING about
 * whether the extractor ever calls it — that is the placebo shape this codebase keeps re-learning: an inert
 * guard reads exactly like a passing one. `extractText` calls this function and no other, so a test against
 * this function is a test of what production does. It mutates `pages` in place (matching the caller's shape)
 * and returns the repaired `rawText`.
 *
 * Flag OFF ⇒ returns `rawText` unchanged, leaves `pages` untouched, pushes no warning: byte-identical.
 */
export function healDisplacedRuns(pages: PageText[], rawText: string, warnings: string[]): string {
  if (!isEnvOn(process.env.AUDIT_INGEST_DISPLACED_RUN)) return rawText;
  let repaired = 0, refusals = 0;
  const heal = (s: string): string => {
    const r = repairDisplacedRuns(s);
    if (r.refused) { refusals++; return s; }
    repaired += r.repairs.length;
    return r.text;
  };
  const healedRaw = heal(rawText);
  for (const p of pages) {
    const t = heal(p.text);
    if (t !== p.text) { p.text = t; p.lines = t.split("\n").map((l) => l.trim()).filter((l) => l.length > 0); }
  }
  if (repaired > 0) warnings.push(`DISPLACED_RUN_REPAIR: relocated ${repaired} interpolated styled run(s) out of the sentences they severed.`);
  if (refusals > 0) warnings.push(`DISPLACED_RUN_REPAIR: ${refusals} pass(es) failed the conservation check and were left unmodified.`);
  return healedRaw;
}

function buildPageStructure(rawText: string, pageCount: number): PageText[] {
  // pdf-parse inserts form-feed (\f) between pages when available.
  const formFeedSplit = rawText.split("\f");
  if (formFeedSplit.length > 1 && formFeedSplit.length <= pageCount + 2) {
    return formFeedSplit
      .filter((s) => s.trim().length > 0)
      .map((text, i) => ({
        pageNum: i + 1,
        text: text.trim(),
        lines: text.trim().split("\n").filter((l) => l.trim().length > 0),
      }));
  }

  // No form feeds — treat as single document block. Downstream section
  // detection operates on line-by-line scan, which still works.
  return [
    {
      pageNum: 1,
      text: rawText.trim(),
      lines: rawText.trim().split("\n").filter((l) => l.trim().length > 0),
    },
  ];
}
