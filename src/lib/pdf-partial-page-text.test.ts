// $0 proof for the mixed cover(text)+body(scanned) false-COMPLETE fix (2026-07-06).
//   • isPartialPageText — the per-page scan detector (pdf-text-extractor).
//   • storage-arm completeness — a single scanned upload (has_text=false) must read
//     INCOMPLETE via agenticManifestComplete, where before ingestion=null read green.
// Run: npx tsx src/lib/pdf-partial-page-text.test.ts
import { isPartialPageText, type PageText } from "./pdf-text-extractor";
import { agenticManifestComplete } from "./audit-executor-v3";
import { renderV3Report, type V3ReportPayload, type V3ReportMeta } from "./audit-v3-report";
import type { IngestionMeta, IngestionFileMeta } from "./sam-attachments";

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want; if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${got} want ${want}`}`);
};

// A page with real body text (well over the 10-char meaningful floor).
const textPage = (n: number): PageText => ({ pageNum: n, text: "This is a solicitation page carrying binding requirements and clauses.", lines: [] });
// A scanned/image page — no extractable text layer.
const scanPage = (n: number): PageText => ({ pageNum: n, text: "", lines: [] });
// A page whose only text is a running footer ("-- 3 of 50 --") → 0 meaningful chars.
const footerOnly = (n: number): PageText => ({ pageNum: n, text: `-- ${n} of 50 --`, lines: [] });

// ── isPartialPageText ──────────────────────────────────────────────────────
// THE catastrophic case: 1 text cover masking a scanned body.
eq("P1 · 1 text cover + 4 scanned body → partial (mixed cover+scanned)", isPartialPageText([textPage(1), scanPage(2), scanPage(3), scanPage(4), scanPage(5)]), true);
eq("P2 · footer-only body pages count as scanned → partial", isPartialPageText([textPage(1), footerOnly(2), footerOnly(3), footerOnly(4)]), true);
// Normal docs must NOT false-flag (a false INCOMPLETE degrades UX).
eq("P3 · all-text doc → not partial", isPartialPageText([textPage(1), textPage(2), textPage(3), textPage(4)]), false);
eq("P4 · one blank signature/divider page among text → not partial (majority still text)", isPartialPageText([textPage(1), textPage(2), textPage(3), scanPage(4)]), false);
eq("P5 · exactly half scanned → not partial (needs STRICT majority)", isPartialPageText([textPage(1), textPage(2), scanPage(3), scanPage(4)]), false);
// Guards.
eq("P6 · <3 pages → never partial (too small to judge)", isPartialPageText([textPage(1), scanPage(2)]), false);
eq("P7 · fully scanned (0 text pages) → not partial (handled by the whole-doc floor, not this signal)", isPartialPageText([scanPage(1), scanPage(2), scanPage(3)]), false);

// ── storage-arm completeness (the #2 wiring semantics) ──────────────────────
const storageIng = (hasText: boolean): IngestionMeta => ({
  files_total: 1, files_ingested: 1, form_identified: true, form_name: "upload.pdf",
  files: [{ name: "upload.pdf", role: "form", bytes: 25_000_000, ingested: true, has_text: hasText } as IngestionFileMeta],
});
// isSamSol=false (genuine upload). Before the fix ingestion was null → agenticManifestComplete(null,…,false)=true (false green).
eq("S1 · storage arm, text PDF (has_text=true) → COMPLETE (no regression)", agenticManifestComplete(storageIng(true), false, false), true);
eq("S2 · storage arm, SCANNED PDF (has_text=false) → INCOMPLETE (was the false-COMPLETE)", agenticManifestComplete(storageIng(false), false, false), false);

// ── report provenance wording (review finding: no fabricated SAM claim for uploads) ─
// A COMPLETE upload set (fromSam=false) must NOT claim "posted to SAM.gov"; a SAM notice
// (fromSam undefined/true) keeps the SAM wording. Drives the real renderer end-to-end.
const meta: V3ReportMeta = { solicitationNumber: null, title: "Upload", agency: null, naicsCode: null, setAside: null, responseDeadline: null, auditId: "aud-x" };
const docPayload = (fromSam: boolean | undefined): V3ReportPayload => ({
  verdict: "BID", eligible: null, reason: "basis",
  showStoppers: [], findings: [],
  coverage: { required: ["B", "C", "L", "M"], covered: ["B", "C", "L", "M"], missing: [] },
  documents: { reconciled: true, posted: 1, read: 1, complete: true, missing: [], ...(fromSam === undefined ? {} : { fromSam }) },
});
const uploadHtml = renderV3Report(docPayload(false), meta);
eq("R1 · complete UPLOAD → says 'document you provided'", /every document you provided/.test(uploadHtml), true);
eq("R2 · complete UPLOAD → does NOT fabricate 'posted to SAM.gov'", /posted<\/b> to SAM\.gov/.test(uploadHtml), false);
const samHtml = renderV3Report(docPayload(undefined), meta);
eq("R3 · complete SAM (legacy fromSam undefined) → keeps 'posted to SAM.gov' wording", /posted<\/b> to SAM\.gov/.test(samHtml), true);

console.log(`\n${fail === 0 ? "ALL GREEN" : "RED"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
