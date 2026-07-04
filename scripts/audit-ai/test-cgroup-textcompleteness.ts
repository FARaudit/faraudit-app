// C.b — TEXT-COMPLETENESS / R2 negatives (C-15 / C-16 / C-17 / C-18, prove C-14). $0, deterministic, NO engine calls.
//   npx tsx scripts/audit-ai/test-cgroup-textcompleteness.ts
//
// R2: a binding doc that did not deliver machine-readable TEXT to the text-only engine ⇒ documents_complete=false
// + export gated. The load-bearing negatives (Brain C.b): a binding worksheet with an image-only body, and a
// mojibake text layer, must both read has_text=false. Unknown/ambiguous role = BINDING.

import { isBindingDoc, hasEngineText } from "@/lib/sam-attachments";
import { bindingContentLossDocs } from "@/lib/audit-executor-v3";
import { shouldGateExport } from "@/lib/audit-display";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else { fails.push(l); console.log(`  [FAIL] ${l}`); } };
const ing = (f: Record<string, unknown>) => ({ files: [f] }) as never; // minimal IngestionMeta for the guard

// ── C-15: ambiguous roles are now BINDING; only unambiguous blank forms stay exempt ──
ok("C-15: price schedule worksheet is BINDING", isBindingDoc({ role: "attachment", name: "Attachment 3 - Price Schedule Worksheet.pdf" }) === true);
ok("C-15: past performance questionnaire is BINDING", isBindingDoc({ role: "attachment", name: "PPQ - Past Performance Questionnaire.pdf" }) === true);
ok("C-15: reps and certs stays NON-binding", isBindingDoc({ role: "attachment", name: "52.204-8 Reps and Certs.pdf" }) === false);
ok("C-15: representations & certifications stays NON-binding", isBindingDoc({ role: "attachment", name: "Representations and Certifications.pdf" }) === false);
ok("C-15: solicitation form + amendment are always binding", isBindingDoc({ role: "form", name: "x" }) === true && isBindingDoc({ role: "amendment", name: "SF-30.pdf" }) === true);

// ── C-16: header/title-only text layer over an image body reads has_text=false (real content check) ──
const HEADER_ONLY = "ATTACHMENT 0003 — CONTRACTOR PRICE SCHEDULE WORKSHEET"; // >50 chars, < 12 real words
ok("C-16: header-only text layer → has_text=false (image body lost)", hasEngineText(HEADER_ONLY) === false);
const REAL_AMENDMENT = "Amendment 0001 hereby changes the solicitation closing date from April 15 2026 to April 30 2026 and incorporates FAR clause 52.204-24 into Section I; all other terms remain unchanged.";
ok("C-16: a genuine short binding doc (real words) → has_text=true", hasEngineText(REAL_AMENDMENT) === true);

// ── C-17: a mojibake/garbled text layer → has_text=false (passes char+word floors, caught by looksGarbled) ──
const MOJIBAKE = "xkqz wbfj mrtp zzvq ".repeat(80); // >300 chars, many [A-Za-z]{3,} tokens, but ~0 common words
ok("C-17: mojibake text layer → has_text=false", hasEngineText(MOJIBAKE) === false);
const CLEAN = "The contractor shall provide all labor, materials, and equipment necessary to perform the work described in the statement of work in accordance with the delivery schedule and inspection requirements set forth herein.";
ok("C-17: clean prose is not garbled → has_text=true", hasEngineText(CLEAN) === true);

// ── C-18: has_text===undefined is UNKNOWN (never present) → content loss ──
ok("C-18: binding doc with has_text=undefined → content loss", bindingContentLossDocs(ing({ name: "SOW.pdf", role: "attachment", bytes: 1000, ingested: true })).length === 1);
ok("C-18: binding doc with has_text=true → no loss", bindingContentLossDocs(ing({ name: "SOW.pdf", role: "attachment", bytes: 1000, ingested: true, has_text: true })).length === 0);

// ── C-14 (prove): image-only binding worksheet ⇒ content loss ⇒ documents_complete=false ⇒ export 409 ──
ok("C-14: image-only binding worksheet is a content loss", bindingContentLossDocs(ing({ name: "Attachment 3 - Price Schedule Worksheet.pdf", role: "attachment", bytes: 50000, ingested: true, has_text: false })).length === 1);
ok("C-14: an offeror-fill reps&certs with no text is NOT a loss (blank by design)", bindingContentLossDocs(ing({ name: "52.204-8 Reps and Certs.pdf", role: "attachment", bytes: 3000, ingested: true, has_text: false })).length === 0);
ok("C-14: documents_complete=false gates export (409)", shouldGateExport({ compliance_json: { engine: "agentic_v3", v3: {}, documents_complete: false } }) === true);
ok("C-14: documents_complete=true grounded verdict exports", shouldGateExport({ compliance_json: { engine: "agentic_v3", v3: {}, documents_complete: true, honest_fail: false } }) === false);

console.log(`\n${fails.length ? "❌" : "✅"} C.b text-completeness: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); process.exit(1); }
