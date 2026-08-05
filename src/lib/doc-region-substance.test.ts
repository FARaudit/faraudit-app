// $0 PROOF — a failed extraction may never be published as "the document IS in the source".
// Run: npx tsx src/lib/doc-region-substance.test.ts   (in src/lib so CI's `self-audit suites` leg runs it)
//
// THE INVERSION. audit-absence-reconcile refutes a lens's "X is not provided" by finding a region named X and
// telling the customer `"X" IS in the retrieved source (N characters)`. N was the raw region length with NO
// floor, so a document the engine FAILED to read was published as present — Rule 61 backwards, a failed
// dependency dressed as an answer. Two measured specimens:
//   · a Wage Determination whose region is `-- 1 of 7 --` … `-- 7 of 7 --` — SEVEN pages, every one blank —
//     refuting a true "not reproduced" claim at "116 characters". That document class is the centre of the
//     panel's most expensive finding on this arc.
//   · an attachment refuted at "105 characters" whose entire region text is the ingest's OWN marker,
//     `[Attachment "…xlsx" — office/zip, 32358 bytes, not text-extracted]`. The engine said it could not read
//     the file; the report said it had.
//
// WHY NOT A CHARACTER FLOOR. Measured over all 374 regions in the banked corpus, magnitude gets this exactly
// backwards: the failed Wage Determination is 116 chars — LONGER than the 105-char non-extraction marker — while
// the shortest region carrying real prose is 221 chars. There is no threshold that separates them. Strip the
// ingest's own scaffolding instead and the separation is total: every failure → 0 substantive letters, the next
// region up → 124. This asserts that separation on the REAL corpus and prints the complement VERBATIM, because a
// count would hide which regions moved.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { docRegions } from "./audit-orchestrator";
import { regionCarriesText, substantiveLetterCount, SUBSTANTIVE_LETTER_FLOOR } from "./doc-region-substance";
import { reconcileAbsenceClaims } from "./audit-absence-reconcile";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

console.log("── 1. THE THREE FAILURE SHAPES, verbatim from the corpus ─────────────────");
const FAILURES: Array<[string, string]> = [
  ["empty region", "\n\n\n\n"],
  ["scaffolding only (7 blank pages)", "\n\n\n-- 1 of 7 --\n\n\n\n-- 2 of 7 --\n\n\n\n-- 3 of 7 --\n\n\n\n-- 4 of 7 --\n\n\n\n-- 5 of 7 --\n\n\n\n-- 6 of 7 --\n\n\n\n-- 7 of 7 --\n\n\n\n\n"],
  ["single blank page", "-- 1 of 1 --"],
  ["the ingest's own non-extraction marker", `[Attachment "Request+for+Information+%28Answered%29.xlsx" — office/zip, 32358 bytes, not text-extracted]\n`],
];
for (const [what, text] of FAILURES)
  assert(!regionCarriesText(text), `${what} (${text.length} chars) does NOT count as presence`);

console.log("\n── 2. REAL CONTENT STILL COUNTS — the floor must not condemn short attachments ──");
const REAL: Array<[string, string]> = [
  ["shortest real region in the corpus (221 chars)", "Appendix F – Storm Drains Newington B1 Memorial Road P Memorial Road Veterans Drive B2E B3 outfall inspection points and associated storm drain structures identified for the site walk described in the statement of work herein."],
  ["a short notice body", "Please see attachment RFP SPRRA2-26-R-0034 for a full description of the requirement, the evaluation approach, and the submission instructions applicable to this acquisition."],
];
for (const [what, text] of REAL) assert(regionCarriesText(text), `${what} DOES count as presence`);

console.log("\n── 3. THE SEPARATION, ON THE REAL CORPUS — complement printed, never counted ──");
const dir = "scripts/audit-ai/run-records";
const records = existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")) : [];
if (!records.length) {
  console.log("⚠ NAMED SKIP — no banked run records present (gitignored corpus). Legs 1, 2 and 4 still gate.");
} else {
  const rows: Array<{ name: string; chars: number; letters: number }> = [];
  for (const f of records) {
    let rec: { input?: { fullSource?: string } };
    try { rec = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch { continue; }
    const src = rec?.input?.fullSource; if (!src) continue;
    for (const r of docRegions(src)) rows.push({ name: r.name, chars: r.text.length, letters: substantiveLetterCount(r.text) });
  }
  assert(rows.length > 300, `the corpus actually reached the regions (${rows.length}) — an empty sweep must never pass`);
  const zero = rows.filter((r) => r.letters === 0);
  const ambiguous = rows.filter((r) => r.letters > 0 && r.letters < SUBSTANTIVE_LETTER_FLOOR);
  const smallestReal = Math.min(...rows.filter((r) => r.letters > 0).map((r) => r.letters));
  // Print WHICH regions strip to nothing, not how many — a count cannot be checked against the source by a reader.
  console.log("   regions stripping to ZERO substantive letters:");
  for (const name of [...new Set(zero.map((r) => r.name))].sort()) {
    const inst = zero.filter((r) => r.name === name);
    console.log(`     · ${name}  (${inst.length}× · raw chars ${[...new Set(inst.map((r) => r.chars))].join("/")})`);
  }
  assert(zero.length > 0, "the corpus contains failed regions at all (else this gate proves nothing)");
  assert(ambiguous.length === 0, `NOTHING lands between 1 and ${SUBSTANTIVE_LETTER_FLOOR - 1} letters — the floor sits in an empty gap${ambiguous.length ? `: ${JSON.stringify(ambiguous)}` : ""}`);
  assert(smallestReal > SUBSTANTIVE_LETTER_FLOOR, `the smallest REAL region (${smallestReal} letters) clears the floor (${SUBSTANTIVE_LETTER_FLOOR}) with room`);
  assert(zero.some((r) => /wage determination/i.test(r.name)), "the Wage Determination — the document at the centre of this arc — is among them");
}

console.log("\n── 4. THE SEAM IS FLAG-GATED, and OFF is byte-identical ──────────────────");
const src = readFileSync("src/lib/audit-absence-reconcile.ts", "utf8");
assert(/AUDIT_REGION_SUBSTANCE_FLOOR/.test(src), "the reconcile arm reads the flag");
assert(/!substanceFloorOn \|\| regionCarriesText/.test(src), "flag OFF short-circuits BEFORE the predicate — no behaviour change, no cost");

console.log("\n── 5. THE BEHAVIOUR, through the real seam — a helper passing is not the fix ──");
// A source carrying two regions: one the engine READ, one whose seven pages all extracted blank. A lens says
// each is not provided. One of those claims is false and must be corrected; the other is TRUE and must survive.
const twoDocs = [
  "==== DOCUMENT: PWS KO Approved - 20260720.pdf ====",
  "The contractor shall furnish all labor, supervision, equipment and materials required to perform grounds",
  "maintenance at the installation described herein, in accordance with the schedule and the performance",
  "standards stated in this statement of work, for the base period and each option period exercised.",
  "==== DOCUMENT: Wage Determination 5-8-26.pdf ====",
  "\n\n-- 1 of 7 --\n\n\n-- 2 of 7 --\n\n\n-- 3 of 7 --\n\n\n-- 4 of 7 --\n\n\n-- 5 of 7 --\n\n\n-- 6 of 7 --\n\n\n-- 7 of 7 --\n\n",
].join("\n");
const claims = [
  { id: "c1", requirement: "The PWS (Attachment 0001) is not provided in the assigned source, so scope cannot be confirmed." },
  { id: "c2", requirement: "The Wage Determination (Attachment 0002) is not provided in the assigned source, so rates are unknown." },
];
const withFlag = (on: boolean) => {
  const prev = process.env.AUDIT_REGION_SUBSTANCE_FLOOR;
  if (on) process.env.AUDIT_REGION_SUBSTANCE_FLOOR = "true"; else delete process.env.AUDIT_REGION_SUBSTANCE_FLOOR;
  try { return reconcileAbsenceClaims(claims.map((c) => ({ ...c })), twoDocs, new Set<string>()); }
  finally { if (prev === undefined) delete process.env.AUDIT_REGION_SUBSTANCE_FLOOR; else process.env.AUDIT_REGION_SUBSTANCE_FLOOR = prev; }
};
const off = withFlag(false), on = withFlag(true);
const refutedIds = (r: ReturnType<typeof reconcileAbsenceClaims>) => r.refuted.map((x) => x.id).sort();
assert(refutedIds(off).includes("c2"), `flag OFF: the blank Wage Determination IS refuted — the defect, preserved (${JSON.stringify(refutedIds(off))})`);
assert(!refutedIds(on).includes("c2"), `flag ON: the TRUE claim about the unreadable document SURVIVES (${JSON.stringify(refutedIds(on))})`);
assert(refutedIds(on).includes("c1"), "flag ON: the genuinely-false claim about the READ document is still corrected — the fix removes nothing it should keep");
assert(!/IS in the retrieved source/.test(on.findings.find((f) => f.id === "c2")?.requirement ?? ""), "flag ON: no 'IS in the retrieved source' sentence is published about a document that produced no text");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — presence is proved by readable text, never by byte count.`);
process.exit(failures === 0 ? 0 : 1);
