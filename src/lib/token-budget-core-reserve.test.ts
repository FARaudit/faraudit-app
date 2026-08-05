// TOKEN BUDGET — CORE RESERVE. CI gate (src/lib/*.test.ts is the glob CI actually runs).
// Run: npx tsx src/lib/token-budget-core-reserve.test.ts
//
// THE DEFECT (measured, live run e5f177aa / W911SG27BA002, 2026-08-05, $4.92): with the raised
// document ceiling admitting 51 of 55 files, the 850k token budget evicted two BINDING documents —
// `Solicitation - W911SG27BA002.pdf` and `Solicitation Amendment - W911SG27BA002 0001.pdf`. The
// engine then produced 54 findings and a verdict without the solicitation, or the amendment that
// supersedes it, in the source.
//
// ROOT: applyTokenBudget exempted exactly one predicate — `role === "form"` — and the form election
// (planDocumentOrder) keeps exactly ONE document in that role, demoting every other candidate. Here
// the winner was "Instructions to Bidders (Revised).pdf", so the solicitation itself competed as an
// ordinary attachment against 50 UFGS spec sheets and lost. The surrounding comments asserted the
// opposite protection — "the primary solicitation + §C/§L/§M survive first", "one huge member can
// never evict §C/§L/§M" — and nothing implemented it.
//
// WHAT IS ASSERTED: core documents are admitted before non-core compete, regardless of tier
// position; output order is unchanged; and a core doc that cannot fit says so distinctly, because
// "the spec sheets did not fit" and "the solicitation did not fit" must never read the same.

import assert from "node:assert";
import { applyTokenBudget, isCoreDoc } from "./sam-attachments";

let passed = 0;
const ok = (label: string, cond: boolean) => { assert.ok(cond, `FAIL — ${label}`); console.log(`  ✓ ${label}`); passed++; };

type Doc = { role: "form" | "amendment" | "attachment"; tokens: number; name: string };
const d = (name: string, tokens: number, role: Doc["role"] = "attachment"): Doc => ({ name, tokens, role });

console.log("── token budget · core reserve ──");

// ── isCoreDoc ────────────────────────────────────────────────────────────────────────────────
ok("the elected form is core", isCoreDoc(d("W911SG27BA002 Instructions to Bidders (Revised).pdf", 1, "form")));
ok("an amendment is core — it SUPERSEDES the base package", isCoreDoc(d("Solicitation Amendment - W911SG27BA002 0001.pdf", 1, "amendment")));
ok("a document naming itself a solicitation is core even as a plain attachment",
  isCoreDoc(d("Solicitation - W911SG27BA002.pdf", 1, "attachment")));
ok("an RFQ is core", isCoreDoc(d("RFQ 1234.pdf", 1, "attachment")));
ok("an SF-1442 cover form is core", isCoreDoc(d("SF 1442 Cover.pdf", 1, "attachment")));
ok("a UFGS spec sheet is NOT core", !isCoreDoc(d("Attachment N - UFGS 31 00 00 Earthwork.pdf", 1)));
ok("a wage determination is NOT core", !isCoreDoc(d("Wage Determination TX20260293 (El Paso Highway).pdf", 1)));

// ── THE REGRESSION, in miniature: the real W911SG27BA002 shape ───────────────────────────────
// The elected form is first (it won the election), the solicitation and its amendment sit LAST in
// tier order behind a wall of spec sheets, and the budget fills before they are reached.
const SPECS = Array.from({ length: 8 }, (_, i) => d(`Attachment N - UFGS ${30 + i} 00 00 Spec.pdf`, 100));
const pkg: Doc[] = [
  d("W911SG27BA002 Instructions to Bidders (Revised).pdf", 100, "form"),
  ...SPECS,
  d("Solicitation - W911SG27BA002.pdf", 100),
  d("Solicitation Amendment - W911SG27BA002 0001.pdf", 100, "amendment"),
];
// Budget fits the form + 8 specs + nothing more, unless core is reserved first.
const { ingest, skipped } = applyTokenBudget(pkg, 900, 250);
const names = new Set(ingest.map((x) => x.name));

ok("the solicitation SURVIVES even though tier order put it behind 8 spec sheets",
  names.has("Solicitation - W911SG27BA002.pdf"));
ok("the amendment SURVIVES — dropping it silently audits a superseded package",
  names.has("Solicitation Amendment - W911SG27BA002 0001.pdf"));
ok("the elected form still survives", names.has("W911SG27BA002 Instructions to Bidders (Revised).pdf"));
ok("something non-core was dropped instead — the budget is still enforced, not widened",
  skipped.length > 0 && skipped.every((s) => !isCoreDoc(s.entry)));
ok("the total is still bounded by the budget",
  ingest.reduce((t, x) => t + (x.truncated ? 250 : x.tokens), 0) <= 900);

// ── ORDER IS NOT A SIDE EFFECT ───────────────────────────────────────────────────────────────
// The partition decides ADMISSION. If it also reordered, downstream positional reads would shift —
// a second, silent change riding along with the intended one.
const order = ingest.map((x) => x.name);
const expected = pkg.filter((p) => names.has(p.name)).map((p) => p.name);
ok("admitted docs are emitted in the CALLER'S original order, not core-first",
  JSON.stringify(order) === JSON.stringify(expected));

// ── PER-DOC TRUNCATION STILL APPLIES TO CORE ─────────────────────────────────────────────────
// A core doc is protected from EVICTION, never from truncation — otherwise one 974-page
// solicitation blows the model context by itself.
const huge = applyTokenBudget([d("Solicitation - Huge.pdf", 5_000)], 900, 250);
ok("an oversized CORE doc is truncated, not exempted from the per-doc cap",
  huge.ingest.length === 1 && huge.ingest[0].truncated === true && huge.ingest[0].truncatedToTokens === 250);

// ── A CORE DOC THAT GENUINELY CANNOT FIT SAYS SO DISTINCTLY ──────────────────────────────────
// If the core set ALONE overflows, no ordering saves it. That must not read like a spec sheet
// falling off the tail — it is the condition under which a verdict is unsound.
const coreOverflow = applyTokenBudget(
  [d("Solicitation - A.pdf", 250), d("Solicitation - B.pdf", 250), d("Solicitation Amendment - C.pdf", 250, "amendment"), d("Solicitation - D.pdf", 250)],
  600, 250
);
const coreReason = coreOverflow.skipped.find((s) => isCoreDoc(s.entry))?.reason ?? "";
ok("a dropped CORE doc names the condition — core set alone overflowed", /CORE documents alone/.test(coreReason));
ok("a dropped core doc is still reported as skipped, never silently absent", coreOverflow.skipped.length > 0);

// ── THE COMPLEMENT: when everything fits, behaviour is unchanged ──────────────────────────────
const roomy = applyTokenBudget(pkg, 1_000_000, 250);
ok("with budget to spare NOTHING is skipped and order is the input order",
  roomy.skipped.length === 0 && JSON.stringify(roomy.ingest.map((x) => x.name)) === JSON.stringify(pkg.map((x) => x.name)));

console.log(`\n✓ ${passed}/${passed} passed — token budget core reserve`);
