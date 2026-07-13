// $0 pin for the OCR-HELD REGISTER (Brain card #471 ruling A, flag AUDIT_OCR_HELD_REGISTER).
// Run: npx tsx src/lib/audit-executor-v3-ocr-held.test.ts
//
// A content-loss doc that OCR RECOVERED but held on unconfirmed residuals reads as an OCR-attempted-HELD read-list
// entry — NEVER "no machine-readable text / content not analyzed". A genuine no-text doc still routes to `missing`.
// Flag-OFF ⇒ every doc → `missing` ⇒ byte-identical. The 6439ac27 WD (19 residuals) is the pinned fixture.
import { splitContentLoss } from "./audit-executor-v3";
import type { IngestionFileMeta } from "./sam-attachments";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// The 6439ac27 WD: OCR recovered text but held on 19 unconfirmed residual tokens (residual-hold path).
const wdHeld: IngestionFileMeta = { name: "Wage Determination 5-8-26.pdf", ingested: true, bytes: 2282296, has_text: false, ocr_suspect: true, ocr_residual: new Array(19).fill("$00.00") } as IngestionFileMeta;
// Card #477 ruling 1a — the 6a67c0f1 WD: OCR recovered the DBA rate table (~14k chars, rode into fullSource) but held
// on CAUGHT MISREADS (the 0→@ garble, suspect=8). ocrDeterministicGate drops ocr_residual to [] on a caught misread,
// so this doc carries ocr_suspect=true + ocr_residual=[] — the register gap that mislabeled it "no machine-readable text".
const wdSuspectHeld: IngestionFileMeta = { name: "Wage Determination 5-8-26.pdf", ingested: true, bytes: 2282296, has_text: false, ocr_suspect: true, ocr_residual: [] as string[] } as IngestionFileMeta;
// A genuinely scanned/image doc: no OCR text recovered (no ocr_suspect, no residuals).
const noText: IngestionFileMeta = { name: "Sign In 05-28-2026.pdf", ingested: true, bytes: 129495, has_text: false } as IngestionFileMeta;

console.log("── flag ON ──");
{
  const { missing, ocrHeld } = splitContentLoss([wdHeld, noText], true);
  const wd = ocrHeld.find((h) => h.name === wdHeld.name);
  assert(!!wd, "WD → ocr_held register (not missing)");
  assert(wd?.residuals === 19, "WD held count = 19 residuals");
  assert(/OCR-recovered; held from committal on 19 unconfirmed residual token\(s\)/.test(wd?.reason ?? ""), "WD reason is the honest OCR-held caveat");
  assert(!missing.some((m) => m.name === wdHeld.name), "WD is NOT in the no-text `missing` class");
  assert(missing.some((m) => m.name === noText.name && /no machine-readable text/.test(m.reason)), "genuine no-text doc still → `missing`");
  assert(!ocrHeld.some((h) => h.name === noText.name), "no-text doc is NOT in ocr_held");
}

console.log("\n── flag ON · ruling 1a — the SUSPECT-hold (caught-misread) path → ocr_held, not missing ──");
{
  const { missing, ocrHeld } = splitContentLoss([wdSuspectHeld, noText], true);
  const wd = ocrHeld.find((h) => h.name === wdSuspectHeld.name);
  assert(!!wd, "suspect-held WD (ocr_residual=[]) → ocr_held register (the register-gap fix)");
  assert(wd?.residuals === 0, "suspect-held count = 0 residuals (caught misread is not vision-recoverable)");
  assert(/caught misread in a numeric-dense read/.test(wd?.reason ?? ""), "suspect-held reason names the caught-misread hold, NOT 'no machine-readable text'");
  assert(!missing.some((m) => m.name === wdSuspectHeld.name), "suspect-held WD is NOT mislabeled no-text `missing`");
  assert(missing.some((m) => m.name === noText.name), "genuine no-text doc still → `missing`");
}

console.log("\n── flag OFF ⇒ byte-identical (all → missing, empty ocr_held) ──");
{
  const { missing, ocrHeld } = splitContentLoss([wdHeld, wdSuspectHeld, noText], false);
  assert(ocrHeld.length === 0, "flag OFF: ocr_held empty");
  assert(missing.length === 3 && missing.every((m) => /no machine-readable text/.test(m.reason)), "flag OFF: all docs → `missing` no-text (byte-identical to prior)");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — OCR-held register pin`);
process.exit(failures === 0 ? 0 : 1);
