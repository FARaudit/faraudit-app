// $0 PROOF for STRICT UCF CLASS DISPATCH (#SEQ5-ROOTS, the root beneath root b).
// Run: npx tsx src/lib/ucf-class-strict.test.ts
//
// Every UCF-classed record in the banked corpus — 4 of 4 — is a FALSE POSITIVE, and all four are the same two VA
// solicitations. Both are SF1449 COMMERCIAL buys with no "SECTION L" and no "SECTION M" anywhere; the loose count
// scored them ucf on table-of-contents dot-leader lines plus the VA's "CONTINUATION OF SF 1449 BLOCKS" A–E scheme.
//
// The discriminator is anchored in REQUIRED_PANEL_SECTIONS = {C,L,M,B}: a package with no §L/§M header can never
// satisfy checkManifest, so dispatching it to the UCF path guarantees INCOMPLETE.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { detectDocumentClass, ucfHeaderKeys, ucfHeaderCount, routeCommercialSections } from "./panel-doc-class";
import { REQUIRED_PANEL_SECTIONS } from "./agentic-panel";
import { requireCorpus } from "./corpus-fixture";

// This suite asserts against BANKED RUN RECORDS, which are intentionally untracked (public repo,
// government email addresses in the data). Absent ⇒ named SKIP, never a silent pass. See corpus-fixture.ts.
requireCorpus("ucf-class-strict");

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const setFlags = (f: Record<string, boolean>) => {
  for (const k of ["AUDIT_UCF_CLASS_STRICT", "AUDIT_ROUTING_HEAD_COVERAGE"]) delete process.env[k];
  for (const [k, v] of Object.entries(f)) if (v) process.env[k] = "true";
};

const REC_DIR = join(process.cwd(), "scripts/audit-ai/run-records/_ua-cohort");
const VA = [
  "36C25626Q1137__150c3ab3-9252-40a4-9ed3-49e64547eb70.json",
  "36C25626Q0947__6f7be8ed-161c-4fa6-b013-7e32f66a9ff1.json",
];
const vaSrc: Array<[string, string]> = [];
for (const f of VA) {
  const p = join(REC_DIR, f);
  if (!existsSync(p)) { console.error(`FIXTURE MISSING: ${p}`); process.exit(1); }
  vaSrc.push([f.split("__")[0], JSON.parse(readFileSync(p, "utf8")).input.fullSource]);
}

console.log("── DOCTRINE ANCHOR ──────────────────────────────────────────────");
const req = new Set(REQUIRED_PANEL_SECTIONS.map((s) => s.key));
assert(req.has("L") && req.has("M"), `the UCF gate REQUIRES §L and §M (${[...req].join(",")}) — so a package lacking both can never pass it`);

console.log("\n── THE TWO VA PACKAGES ARE COMMERCIAL, ON EVIDENCE ──────────────");
for (const [sol, src] of vaSrc) {
  assert(/\bSF[\s-]?1449\b|SOLICITATION\/CONTRACT\/ORDER FOR COMMERCIAL/i.test(src), `${sol}: SF1449 commercial form present`);
  assert(!/\bSF[\s-]?33\b|SOLICITATION, OFFER AND AWARD/i.test(src), `${sol}: SF33 (UCF sealed-bid form) ABSENT`);
  assert(!/^\s*SECTION\s+L\b/m.test(src), `${sol}: no "SECTION L" header anywhere`);
  assert(!/^\s*SECTION\s+M\b/m.test(src), `${sol}: no "SECTION M" header anywhere`);
  assert(/CONTINUATION OF SF 1449/i.test(src), `${sol}: carries the "CONTINUATION OF SF 1449 BLOCKS" scheme`);
}

console.log("\n── RED POLE (flag OFF — today's misclassification) ──────────────");
setFlags({});
for (const [sol, src] of vaSrc) {
  assert(detectDocumentClass(src) === "ucf", `BUG REPRODUCED: ${sol} classes 'ucf' (${ucfHeaderCount(src)} loose headers)`);
}

console.log("\n── GREEN POLE (flag ON) ─────────────────────────────────────────");
setFlags({ AUDIT_UCF_CLASS_STRICT: true });
for (const [sol, src] of vaSrc) {
  const strict = ucfHeaderKeys(src, { excludeToc: true });
  const loose = ucfHeaderKeys(src);
  assert(detectDocumentClass(src) === "commercial", `${sol} now classes 'commercial' (strict keys [${[...strict].sort().join(",")}] vs loose [${[...loose].sort().join(",")}])`);
  assert(strict.size < loose.size, `  TOC dot-leader lines discarded (${loose.size} → ${strict.size} keys)`);
}

console.log("\n── TOC EXCLUSION, ISOLATED ──────────────────────────────────────");
const TOC_ONLY = [
  "TABLE OF CONTENTS",
  "SECTION A ...................................................... 1",
  "SECTION B ...................................................... 4",
  "SECTION C ...................................................... 9",
].join("\n");
assert(ucfHeaderKeys(TOC_ONLY).size === 3, "loose count sees 3 keys in a pure TOC block");
assert(ucfHeaderKeys(TOC_ONLY, { excludeToc: true }).size === 0, "strict count sees 0 — a TOC is not a section structure");

console.log("\n── FALSIFICATION: a genuine UCF package must STAY ucf ───────────");
const REAL_UCF = [
  "SECTION A - SOLICITATION/CONTRACT FORM", "Standard Form 33 follows.",
  "SECTION B - SUPPLIES OR SERVICES AND PRICES", "CLIN 0001 firm-fixed unit price.",
  "SECTION C - DESCRIPTION/SPECIFICATIONS", "The contractor shall perform the statement of work.",
  "SECTION I - CONTRACT CLAUSES", "Contract clauses incorporated by reference.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Offerors shall submit a technical volume.",
  "SECTION M - EVALUATION FACTORS FOR AWARD", "Award will be made best-value tradeoff.",
].join("\n");
setFlags({});
const realOff = detectDocumentClass(REAL_UCF);
setFlags({ AUDIT_UCF_CLASS_STRICT: true });
const realOn = detectDocumentClass(REAL_UCF);
assert(realOff === "ucf" && realOn === "ucf", `genuine UCF stays 'ucf' at BOTH poles (${realOff} / ${realOn})`);

// A UCF doc that has L but not M (sealed-bid IFB shape) must still class ucf.
const IFB = REAL_UCF.split("SECTION M")[0];
assert(detectDocumentClass(IFB) === "ucf", "UCF with §L but no §M (IFB shape) still classes 'ucf'");

console.log("\n── CORPUS: the flag may only move docs ucf→commercial ───────────");
const ROOT = join(process.cwd(), "scripts/audit-ai/run-records");
const files: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : e.endsWith(".json") && files.push(p); } };
walk(ROOT);
const seen = new Set<string>();
let total = 0, ucfToCommercial = 0, commercialToUcf = 0, unchanged = 0;
for (const f of files) {
  let rec: any; try { rec = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  const src: string | undefined = rec?.input?.fullSource;
  if (!src || src.length < 500) continue;
  const key = `${rec?.meta?.sol ?? "?"}:${src.length}`;
  if (seen.has(key)) continue; seen.add(key);
  total++;
  setFlags({}); const before = detectDocumentClass(src);
  setFlags({ AUDIT_UCF_CLASS_STRICT: true }); const after = detectDocumentClass(src);
  if (before === after) unchanged++;
  else if (before === "ucf" && after === "commercial") ucfToCommercial++;
  else commercialToUcf++;
}
console.log(`   ${total} distinct packages · unchanged ${unchanged} · ucf→commercial ${ucfToCommercial} · commercial→ucf ${commercialToUcf}`);
assert(commercialToUcf === 0, "ZERO packages move commercial→ucf (the flag can only relax INTO the fallback-bearing path)");
assert(ucfToCommercial > 0, `${ucfToCommercial} package(s) corrected ucf→commercial`);

console.log("\n── ARM-ORDER HAZARD (must fail loudly, not silently) ────────────");
// Reclassifying these packages sends them down the ROUTED path. Routing drops the pre-first-anchor head unless
// AUDIT_ROUTING_HEAD_COVERAGE is also armed — which would replace today's honest INCOMPLETE with a CONFIDENT
// verdict missing the cover page (deadline · questions deadline · set-aside · NAICS). This leg exists so that
// arm-order dependency is a TEST, not a sentence in a commit message nobody re-reads.
const [, probeSrc] = vaSrc[0];
setFlags({ AUDIT_UCF_CLASS_STRICT: true });
const noHead = routeCommercialSections(probeSrc, { v2: false });
assert(noHead.headChars > 0, `reclassified package routes with a ${noHead.headChars}-char head at stake`);
assert(
  noHead.headCovered === false,
  "HAZARD CONFIRMED: with CLASS_STRICT armed and HEAD_COVERAGE off, the head is NOT covered — these two flags must be armed TOGETHER",
);
setFlags({ AUDIT_UCF_CLASS_STRICT: true, AUDIT_ROUTING_HEAD_COVERAGE: true });
const withHead = routeCommercialSections(probeSrc, { v2: false });
assert(withHead.headCovered === true, "…and armed together, the head IS covered");
assert(
  withHead.routed === noHead.routed && JSON.stringify(withHead.placedKeys) === JSON.stringify(noHead.placedKeys),
  "head coverage still does not alter the route decision on this package",
);

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
