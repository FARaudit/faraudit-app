// $0 proof for agenticManifestComplete — the verdict-cap completeness signal, including
// the panel BLOCKER fix: a SAM sol whose manifest assembly FAILED (null ingestion) must
// read INCOMPLETE for the verdict, not green BID. Run: npx tsx src/lib/audit-manifest-complete.test.ts
import { agenticManifestComplete, bindingContentLossDocs } from "./audit-executor-v3";
import { isBindingDoc, hasEngineText } from "./sam-attachments";
import type { IngestionMeta, IngestionFileMeta } from "./sam-attachments";

const ing = (o: Partial<IngestionMeta>): IngestionMeta => ({ files_total: 0, files_ingested: 0, files: [], form_identified: true, form_name: "primary", ...(o as object) } as unknown as IngestionMeta);
const file = (o: Partial<IngestionFileMeta> & Pick<IngestionFileMeta, "name">): IngestionFileMeta =>
  ({ role: "attachment", bytes: 1000, ingested: true, ...o });

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want; if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${got} want ${want}`}`);
};

// truncation always wins → incomplete
eq("T1 · truncated (docs dropped) → incomplete", agenticManifestComplete(null, true, false), false);
eq("T2 · truncated even with a full manifest → incomplete", agenticManifestComplete(ing({ files_total: 3, files_ingested: 3 }), true, true), false);

// manifest present → reconcile counts
eq("T3 · manifest all ingested, no overflow → complete", agenticManifestComplete(ing({ files_total: 5, files_ingested: 5 }), false, true), true);
eq("T4 · manifest short (read 4 of 7) → incomplete", agenticManifestComplete(ing({ files_total: 7, files_ingested: 4 }), false, true), false);
eq("T5 · manifest overflow set → incomplete", agenticManifestComplete(ing({ files_total: 5, files_ingested: 5, overflow: "trimmed" }), false, true), false);
eq("T6 · manifest 0 files → incomplete (can't reconcile)", agenticManifestComplete(ing({ files_total: 0, files_ingested: 0 }), false, true), false);

// THE BLOCKER: null ingestion means OPPOSITE things for SAM vs upload
eq("T7 · null ingestion + SAM sol (manifest assembly failed) → INCOMPLETE (was the false-green BID)", agenticManifestComplete(null, false, true), false);
eq("T8 · null ingestion + genuine upload (user supplied docs) → complete", agenticManifestComplete(null, false, false), true);
eq("T9 · undefined ingestion + SAM sol → incomplete", agenticManifestComplete(undefined, false, true), false);

// ── SILENT-PARTIAL guard (Brain card 224 fork 2): bytes arrived ≠ text reached the text-only engine ──
// A scanned binding doc (has_text=false) among a fully-fetched manifest must read INCOMPLETE, not green.
const scannedSOW = file({ name: "C - Statement of Work (scanned).pdf", role: "attachment", has_text: false });
const scannedM = file({ name: "M - Evaluation Factors.pdf", role: "attachment", has_text: false });
const textSOW = file({ name: "C - Statement of Work.pdf", role: "attachment", has_text: true });
const blankRepsCerts = file({ name: "Attachment 3 - Reps and Certs (fillable).pdf", role: "attachment", has_text: false });
const legacyNoField = file({ name: "some attachment.pdf", role: "attachment" }); // has_text undefined (pre-field record)

eq("T10 · scanned BINDING §M among a full manifest → INCOMPLETE (silent-partial closed)",
  agenticManifestComplete(ing({ files_total: 2, files_ingested: 2, files: [textSOW, scannedM] }), false, true), false);
eq("T11 · all binding docs have_text → complete",
  agenticManifestComplete(ing({ files_total: 2, files_ingested: 2, files: [textSOW, file({ name: "M.pdf", has_text: true })] }), false, true), true);
eq("T12 · blank OFFEROR-FILL form (reps & certs) with no text → still complete (non-binding, exempt)",
  agenticManifestComplete(ing({ files_total: 2, files_ingested: 2, files: [textSOW, blankRepsCerts] }), false, true), true);
// Post-5bb6820 (C-group tranche, Brain C.b / C-18, CEO Rule-61 card 251): bindingContentLossDocs changed from
// `has_text === false` to `has_text !== true` — an ingested BINDING doc whose text status is UNKNOWN
// (has_text undefined, e.g. a legacy record written before the field) is a CONTENT LOSS, not silently complete.
// This DELIBERATELY flips such legacy records to INCOMPLETE on replay: the ruled, fail-SAFE direction (unknown ⇒
// cannot certify complete), never a false COMPLETE. (Not a backward-compat regression — an intentional ruling.)
eq("T13 · legacy record (has_text undefined) on a BINDING doc → INCOMPLETE (unknown text = content loss, C-18 fail-safe)",
  agenticManifestComplete(ing({ files_total: 2, files_ingested: 2, files: [textSOW, legacyNoField] }), false, true), false);

// content-loss enumerator + binding classifier
eq("T14 · bindingContentLossDocs names ONLY the scanned binding doc",
  bindingContentLossDocs(ing({ files: [textSOW, scannedM, blankRepsCerts] })).map((f) => f.name).join("|"), "M - Evaluation Factors.pdf");
eq("T15 · isBindingDoc: SOW attachment is binding", isBindingDoc(scannedSOW), true);
eq("T16 · isBindingDoc: reps-and-certs fillable is NOT binding", isBindingDoc(blankRepsCerts), false);
eq("T17 · isBindingDoc: amendment is binding", isBindingDoc(file({ name: "amd 0001.pdf", role: "amendment" })), true);
eq("T18 · isBindingDoc: primary form is binding", isBindingDoc(file({ name: "SF1449.pdf", role: "form" })), true);

// ── has_text = ENGINE text-inclusion floor (~50), NOT the 200-char vision threshold (code-review fix) ──
// A short binding doc the engine actually assembles into fullSource must count as has_text (no false INCOMPLETE).
const short = "The response deadline is hereby extended to 1 August 2026; all other terms and conditions of the solicitation remain unchanged and in full force."; // ~140 chars, >50
eq("H1 · ~140-char amendment (engine reads it) → hasEngineText true (no false content-loss)", hasEngineText(short), true);
eq("H2 · 30-char blip → hasEngineText false", hasEngineText("closing date extended."), false);
eq("H3 · empty → false", hasEngineText(""), false);
eq("H4 · null → false", hasEngineText(null), false);
eq("H5 · failed-extraction sentinel (even if long) → false", hasEngineText("[PDF_EXTRACTION_FAILED] " + "x".repeat(300)), false);
eq("H6 · a short binding amendment is NOT flagged as content-loss",
  bindingContentLossDocs(ing({ files: [file({ name: "SF30 Amendment 0001.pdf", role: "amendment", has_text: true })] })).length, 0);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
