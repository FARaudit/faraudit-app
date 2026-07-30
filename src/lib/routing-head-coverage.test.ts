// $0 PROOF for ROUTING HEAD COVERAGE (the R4a pre-first-anchor drop).
// Run: npx tsx src/lib/routing-head-coverage.test.ts
//
// routeCommercialSections slices from the FIRST ANCHOR to EOF, so everything before that anchor was read by NO
// lens and reported by nothing. Measured over the banked corpus: 16 of 18 distinct commercial packages that ROUTE
// lose head content (89%, median ~2.0K chars, worst 9,121 = 14.4% of that document). It is doubly lost, because
// computeUnrouted only surfaces shall/must/furnish lines and a set-aside statement has none of those verbs.
//
// The head is the region that decides WHO MAY BID and BY WHEN — deadline, questions deadline, set-aside, NAICS,
// submission POC. Legs below run BOTH poles; the flag-OFF legs assert the bug is present.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { routeCommercialSections, detectDocumentClass } from "./panel-doc-class";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const FLAG = "AUDIT_ROUTING_HEAD_COVERAGE";
const setFlag = (on: boolean) => { if (on) process.env[FLAG] = "true"; else delete process.env[FLAG]; };

// ── R4a, the canonical casualty: a set-aside cover statement ahead of the first anchor, carrying NO binding verb
// (so the unroutedBinding honesty net cannot see it either). The small-business lens owns "A".
const R4A = [
  "COMBINED SYNOPSIS/SOLICITATION",
  "This acquisition is set aside for small business under NAICS 561720.",
  "Questions are due no later than 0900 CT on 12 August 2026.",
  "Offers are due 15 August 2026.",
  "",
  "Instructions to Offerors",
  "Quotes shall be submitted by email in portable document format.",
  "",
  "Evaluation criteria",
  "Award will be made on a lowest-priced, technically acceptable basis.",
  "",
  "Schedule of items",
  "CLIN 0001 base year, unit price firm-fixed.",
].join("\n");

console.log("── R4a FIXTURE · RED POLE (flag OFF) ─────────────────────────────");
setFlag(false);
const offR4 = routeCommercialSections(R4A, { v2: true });
const offAll = Object.values(offR4.sectionText).join("\n");
assert(offR4.placedKeys.length > 0, `fixture routes (placed=[${offR4.placedKeys.join(",")}])`);
assert(!offAll.includes("set aside for small business"), "BUG REPRODUCED: set-aside cover statement is in NO slice");
assert(!offAll.includes("0900"), "BUG REPRODUCED: 0900 questions deadline is in NO slice");
assert(offR4.sectionText["A"] === undefined, "BUG REPRODUCED: no 'A' slice exists — smallbiz lens gets no cover content");

console.log("\n── R4a FIXTURE · GREEN POLE (flag ON) ────────────────────────────");
setFlag(true);
const onR4 = routeCommercialSections(R4A, { v2: true });
const onAll = Object.values(onR4.sectionText).join("\n");
assert(onAll.includes("set aside for small business"), "RECOVERED: set-aside statement is now in a slice");
assert(onAll.includes("0900"), "RECOVERED: 0900 questions deadline is now in a slice");
assert((onR4.sectionText["A"] ?? "").includes("set aside"), "head routed to 'A' (owned by smallbiz_eligibility_counsel in both maps)");
assert((onR4.sectionText["L"] ?? "").includes("0900"), "head also prepended to 'L' (deadlines reach capture + source-selection)");

console.log("\n── DECISION ISOLATION (the regression this could have caused) ────");
// Head injection must NOT flip route-vs-fallback. A source whose anchors place M but NOT L must keep routed=false
// so the caller still takes the COMPLETE whole-source fallback — injecting an "L" from the head would swap a full
// read for a partial one, a coverage regression dressed as a coverage fix.
const NO_L = [
  "Cover page: this requirement is unrestricted. Responses due 01 September 2026.",
  "",
  "Evaluation criteria",
  "Award will be made on a best-value tradeoff.",
].join("\n");
setFlag(false);
const noLoff = routeCommercialSections(NO_L, { v2: true });
setFlag(true);
const noLon = routeCommercialSections(NO_L, { v2: true });
assert(noLoff.routed === noLon.routed, `routed predicate UNCHANGED by the flag (${noLoff.routed} → ${noLon.routed})`);
assert(
  JSON.stringify(noLoff.placedKeys) === JSON.stringify(noLon.placedKeys),
  `placedKeys UNCHANGED by the flag ([${noLoff.placedKeys.join(",")}] → [${noLon.placedKeys.join(",")}])`,
);
assert(
  (noLon.sectionText["L"] ?? "").includes("Responses due"),
  "…yet the head content IS still delivered (additive coverage, non-decisional)",
);

console.log("\n── NO-HEAD CASE must be byte-identical ───────────────────────────");
const NO_HEAD = "Instructions to Offerors\nQuotes shall be submitted by email.\n\nEvaluation criteria\nAward will be made LPTA.";
setFlag(false); const nhOff = routeCommercialSections(NO_HEAD, { v2: true });
setFlag(true);  const nhOn  = routeCommercialSections(NO_HEAD, { v2: true });
assert(
  JSON.stringify(nhOff.sectionText) === JSON.stringify(nhOn.sectionText),
  "a source whose first anchor is at position 0 is BYTE-IDENTICAL under the flag",
);

console.log("\n── CORPUS SWEEP · both poles over every banked commercial package ─");
const ROOT = join(process.cwd(), "scripts/audit-ai/run-records");
if (!existsSync(ROOT)) { console.error(`corpus missing: ${ROOT}`); process.exit(1); }
const files: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : e.endsWith(".json") && files.push(p); } };
walk(ROOT);

const seen = new Set<string>();
let routedPkgs = 0, lostBefore = 0, lostAfter = 0, decisionFlips = 0;
let worstBefore = 0;
for (const f of files) {
  let rec: any; try { rec = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  const src: string | undefined = rec?.input?.fullSource;
  if (!src || src.length < 500 || detectDocumentClass(src) !== "commercial") continue;
  const key = `${rec?.meta?.sol ?? "?"}:${src.length}`;
  if (seen.has(key)) continue; seen.add(key);

  setFlag(false); const a = routeCommercialSections(src, { v2: false });
  setFlag(true);  const b = routeCommercialSections(src, { v2: false });
  if (a.placedKeys.length === 0) continue;
  // decision isolation across the whole corpus
  if (a.routed !== b.routed || JSON.stringify(a.placedKeys) !== JSON.stringify(b.placedKeys)) decisionFlips++;

  // Use the REPORTED headChars — never an inferred anchor position. Two earlier revisions of this leg guessed:
  // first by asking whether one slice held the document's first 400 chars (a span that CROSSES the head/anchor
  // boundary, so no slice can ever hold it), then by locating the anchor with indexOf (which latches onto a
  // table-of-contents duplicate and measured a ~2K head as 101K). Both produced confident wrong numbers.
  if (a.headChars !== b.headChars) decisionFlips++;   // headChars must be pole-invariant: it MEASURES, not fixes
  if (a.headChars < 100) continue;   // negligible head; injection intentionally skips these

  // INDEPENDENT containment check — deliberately NOT `headCovered`. That field is set by the code under test, so
  // asserting on it would be the implementation certifying itself (the placebo family). Instead take a fragment
  // that is definitionally INSIDE the head region (the first 100 chars of the trimmed source, given headChars >=
  // 100) and require some slice to actually contain it.
  routedPkgs++;
  worstBefore = Math.max(worstBefore, a.headChars);
  const headFrag = src.trimStart().slice(0, 100);
  const headIn = (st: Record<string, string>) => Object.values(st).some((t) => t.includes(headFrag));
  if (!headIn(a.sectionText)) lostBefore++;
  if (!headIn(b.sectionText)) lostAfter++;
}
console.log(`   distinct routed commercial packages with a >=100-char head : ${routedPkgs} (worst head ${worstBefore.toLocaleString()} chars)`);
assert(routedPkgs >= 10, `corpus is a real sample (${routedPkgs} routed packages)`);
assert(lostBefore > 0, `BUG REPRODUCED corpus-wide: ${lostBefore}/${routedPkgs} packages had an unreadable head at flag-OFF`);
assert(lostAfter === 0, `RECOVERED corpus-wide: ${lostAfter}/${routedPkgs} packages have an unreadable head at flag-ON`);
assert(decisionFlips === 0, `ZERO route-vs-fallback decisions changed across ${routedPkgs} packages (decision isolation holds)`);

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
