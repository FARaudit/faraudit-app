// TASK 9 — "nobody owns the residue". Sizes the EXISTING coverage mandate against the banked corpus,
// using the PRODUCTION tools (`listBindingDocuments`, `readDocument`). $0, no model calls, no paid run.
//
// WHAT IS ACTUALLY WIRED TODAY (audit-expert.ts:138-192), read from source:
//   · AUDIT_ATTACHMENT_COVERAGE=false in prod  ⇒ isCoverageLens is never true ⇒ bindingDocs=[] ⇒
//     the MANDATORY checklist ("for EACH, ground >=1 verbatim obligation OR attest") is emitted to NOBODY,
//     and the pre-inject seeding never runs.
//   · AUDIT_LENS_DISCOVERY=true in prod ⇒ all five lenses get the NAMES notice, whose operative sentence is
//     "Read the ones whose subject matter your lens owns; ignore the rest." An OFFER.
//   ⇒ No lens is obliged to open any document. That is the residue, and it is a design choice, not a bug.
//
// THIS MEASURES what arming the existing mandate would cost, which the prior note said could not be sized
// ("do not size the arm off this corpus — its max is 15 binding docs; 3b5bba30 is NOT banked"). 3b5bba30 and
// e5f177aa ARE banked now, so the measurement is finally possible.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listBindingDocuments, readDocument, DOC_READ_CAP } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools";

const DIR = "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
const CHARS_PER_TOK = 3.82;   // measured on this package with count_tokens, not the 3.5 constant

type Row = { file: string; sol: string; docs: number; injectChars: number; truncated: number; readWhole: number };
const rows: Row[] = [];

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let d: any;
  try { d = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { continue; }
  const fullSource: string | undefined = d?.input?.fullSource;
  if (!fullSource) continue;
  const ctx: any = { fullSource, sections: d?.input?.sections ?? null, noticeBodyText: d?.input?.noticeBodyText ?? null };

  const names = listBindingDocuments(ctx);
  let injectChars = 0, truncated = 0, readWhole = 0;
  for (const n of names) {
    const r = readDocument(ctx, n);
    if (!r.present) continue;
    injectChars += r.text.length;                 // what the pre-inject would seed (already DOC_READ_CAP-capped)
    if (r.truncated) truncated++; else readWhole++;
  }
  rows.push({ file: f, sol: d?.meta?.sol ?? f.slice(0, 20), docs: names.length, injectChars, truncated, readWhole });
}

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const withDocs = rows.filter((r) => r.docs > 0);
console.log(`packages measured: ${rows.length}   ·   with binding attachments: ${withDocs.length}`);
console.log(`DOC_READ_CAP = ${DOC_READ_CAP.toLocaleString()} chars per document\n`);

console.log("── What arming AUDIT_ATTACHMENT_COVERAGE would PRE-INJECT into the ONE coverage lens");
const inj = withDocs.map((r) => r.injectChars);
console.log(`   binding docs per package   : p50 ${med(withDocs.map((r) => r.docs))}  ·  max ${Math.max(...withDocs.map((r) => r.docs))}`);
console.log(`   pre-inject chars           : p50 ${med(inj).toLocaleString()}  ·  max ${Math.max(...inj).toLocaleString()}`);
console.log(`   pre-inject TOKENS (@${CHARS_PER_TOK}) : p50 ${Math.round(med(inj) / CHARS_PER_TOK).toLocaleString()}  ·  max ${Math.round(Math.max(...inj) / CHARS_PER_TOK).toLocaleString()}`);
console.log(`   packages over 200k tokens  : ${withDocs.filter((r) => r.injectChars / CHARS_PER_TOK > 200_000).length}`);
console.log(`   packages over 100k tokens  : ${withDocs.filter((r) => r.injectChars / CHARS_PER_TOK > 100_000).length}`);

console.log("\n── The honest-fail cost: a TRUNCATED read is NOT provably-read-whole");
console.log("   (audit-expert.ts:151 adds to docsRead only when !truncated ⇒ a truncated doc can never be");
console.log("    attested ⇒ it stays uncovered ⇒ INCOMPLETE, no matter how well the lens performs)");
const anyTrunc = withDocs.filter((r) => r.truncated > 0);
console.log(`   packages with >=1 truncated binding doc : ${anyTrunc.length} of ${withDocs.length}`);
console.log(`   total truncated binding docs            : ${withDocs.reduce((a, r) => a + r.truncated, 0)}`);
console.log(`   ⇒ packages FORCED to INCOMPLETE by the arm alone: ${anyTrunc.length} of ${withDocs.length}`);

console.log("\n── Heaviest packages (the ones the arm has to survive)");
for (const r of [...withDocs].sort((a, b) => b.injectChars - a.injectChars).slice(0, 8))
  console.log(`   ${r.sol.slice(0, 20).padEnd(22)} docs=${String(r.docs).padStart(3)}  inject=${String(Math.round(r.injectChars / CHARS_PER_TOK)).padStart(7)} tok  truncated=${String(r.truncated).padStart(3)}  readWhole=${String(r.readWhole).padStart(3)}`);
