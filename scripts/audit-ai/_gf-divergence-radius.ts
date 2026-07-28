// RECON PROBE — BLAST RADIUS OF THE GROUNDING DIVERGENCE.  $0, read-only, offline (record cache).
//
// THE CLAIM UNDER TEST. `isGrounded` (audit-expert.ts:32) is the ONLY grounding predicate that reads
// ctx.groundingSource. Every other one grounds against fullSource — the ASSEMBLED/FILTERED/COMPRESSED
// digest. groundingSource (audit-executor-v3.ts:537) is `docs.map(d=>d.text).join("\n\n")` over the
// PRE-filter, PRE-drop, PRE-compression doc list; fullSource (:302) is assembled.source, which under
// lossless is binding-FILTERED, under chunked is map-reduce COMPRESSED, under budgeted may have WHOLE
// docs DROPPED — and which additionally carries "==== DOCUMENT: n ====" delimiters and may be APPENDED
// to (arc-B vision wage rates). So the two strings diverge in BOTH directions, and this probe measures
// each separately rather than assuming which one bites.
//
//   DIVERGENCE A — excerpt is in groundingSource but NOT in fullSource.
//       isGrounded ACCEPTS it; findingProvenance/groundedSourceRegionNames/isGroundedInSource all read
//       it as ungrounded. A survives into `findings` carrying grounded:true that the digest cannot show.
//   DIVERGENCE B — excerpt is in fullSource but NOT in groundingSource.
//       isGrounded takes the groundingSource branch and NEVER falls back (:36-39), so it REJECTS a
//       finding that is verbatim in the text the model actually read. Legitimate finding, silently dropped.
//
// FALSIFICATION FIRST. Two PLANTED records run before the corpus, one per direction. If either fails to
// trip, this probe cannot detect the thing it claims to count and it exits 1 rather than printing a
// believable zero — a sweep that finds nothing is the most convincing false clean there is.
//
// The predicates are IMPORTED from production, never reimplemented, so the numbers are the engine's own
// semantics (normalization included), not this file's idea of them.
import * as fs from "fs";
import * as path from "path";
import { isGrounded } from "../../src/lib/audit-expert";
import { findInSource, type AuditToolContext } from "../../src/lib/audit-tools";
import { findingProvenance } from "../../src/lib/audit-orchestrator";
import type { TypedFinding } from "../../src/lib/audit-findings";

const CACHE = path.join(__dirname, ".run-record-cache");

const inFullSource = (fullSource: string, excerpt: string): boolean =>
  !!excerpt && excerpt.trim().length >= 4 && findInSource({ fullSource }, excerpt).hits.length > 0;

/** Classify one finding against the two corpora with the PRODUCTION predicates. */
function classify(ctx: AuditToolContext, f: TypedFinding): "A" | "B" | "agree" | "no-excerpt" {
  if (!f.excerpt || f.excerpt.trim().length < 4) return "no-excerpt";
  const byIsGrounded = isGrounded(ctx, f as never);
  const byFullSource = inFullSource(ctx.fullSource, f.excerpt);
  if (byIsGrounded && !byFullSource) return "A";
  if (!byIsGrounded && byFullSource) return "B";
  return "agree";
}

// ── STEP 1 · PLANTED KNOWN-POSITIVES (must trip, else the probe is inert) ────────────────────────────
const mk = (excerpt: string): TypedFinding =>
  ({ id: "planted", requirement: "r", citation: "c", excerpt, kind: "other", controllability: "bidder_controls" } as TypedFinding);

const plantA: AuditToolContext = {
  fullSource: "the offeror shall submit a written quotation to the contracting officer",
  groundingSource: "the offeror shall submit a written quotation to the contracting officer. attendance at the mandatory site visit is a precondition to award.",
};
const plantB: AuditToolContext = {
  fullSource: "the offeror shall submit a written quotation. vision-confirmed wage rate: laborer $28.41 per hour.",
  groundingSource: "the offeror shall submit a written quotation.",
};
const gotA = classify(plantA, mk("attendance at the mandatory site visit is a precondition to award"));
const gotB = classify(plantB, mk("vision-confirmed wage rate: laborer $28.41 per hour"));
console.log(`PLANTED  A(groundingSource-only) -> ${gotA}   B(fullSource-only) -> ${gotB}`);
if (gotA !== "A" || gotB !== "B") {
  console.error(`\n✗ PROBE IS INERT — planted cases did not trip (expected A/B, got ${gotA}/${gotB}). No corpus number is reportable.`);
  process.exit(1);
}
console.log(`✓ probe is live — both directions detectable\n`);

// ── STEP 2 · THE CORPUS ─────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(CACHE)) { console.error(`no record cache at ${CACHE}`); process.exit(1); }

let files = 0, withGrounding = 0, differing = 0, identical = 0, noGroundingField = 0;
let tot = 0, aCount = 0, bCount = 0, agree = 0, noExcerpt = 0, provUngrounded = 0;
const rows: Array<{ id: string; sol: string; a: number; b: number; tot: number; prov: number; gLen: number; fLen: number }> = [];

for (const file of fs.readdirSync(CACHE).filter((f) => f.endsWith(".json"))) {
  files++;
  let rec: any;
  try { rec = JSON.parse(fs.readFileSync(path.join(CACHE, file), "utf8")); } catch { continue; }
  const fullSource = String(rec?.input?.fullSource ?? "");
  const groundingSource = rec?.input?.groundingSource;
  const findings = (rec?.result?.findings ?? []) as TypedFinding[];
  if (!fullSource || !Array.isArray(findings)) continue;

  if (typeof groundingSource !== "string" || !groundingSource) { noGroundingField++; continue; }
  withGrounding++;
  if (groundingSource === fullSource) { identical++; continue; }   // isGrounded falls through to fullSource — no divergence possible
  differing++;

  const ctx: AuditToolContext = { fullSource, groundingSource };
  let a = 0, b = 0;
  for (const f of findings) {
    const c = classify(ctx, f);
    tot++;
    if (c === "A") { a++; aCount++; }
    else if (c === "B") { b++; bCount++; }
    else if (c === "agree") agree++;
    else noExcerpt++;
  }
  const prov = findingProvenance(fullSource, findings).filter((p) => p.doc === "(ungrounded)").length;
  provUngrounded += prov;
  rows.push({ id: file.split("__")[1]?.slice(0, 8) ?? file.slice(0, 8), sol: file.split("__")[0], a, b, tot: findings.length, prov, gLen: groundingSource.length, fLen: fullSource.length });
}

console.log(`RECORDS`);
console.log(`  cache files ....................... ${files}`);
console.log(`  no groundingSource banked ......... ${noGroundingField}   (isGrounded falls back to fullSource — divergence impossible)`);
console.log(`  groundingSource banked ............ ${withGrounding}`);
console.log(`    ├─ identical to fullSource ...... ${identical}   (fall-through — no divergence)`);
console.log(`    └─ DIFFERS from fullSource ...... ${differing}   ← isGrounded takes the groundingSource branch here`);
console.log(`\nFINDINGS across the ${differing} diverging record(s)`);
console.log(`  findings with a usable excerpt .... ${tot - noExcerpt}`);
console.log(`  both predicates agree ............. ${agree}`);
console.log(`  ── DIVERGENCE A (grounding-only) ... ${aCount}   grounded:true the digest cannot show`);
console.log(`  ── DIVERGENCE B (fullSource-only) .. ${bCount}   verbatim in what the model read, REJECTED by isGrounded`);
console.log(`  no excerpt ........................ ${noExcerpt}`);
console.log(`  findingProvenance "(ungrounded)" .. ${provUngrounded}`);

if (rows.length) {
  console.log(`\nPER RECORD (A / B / findings · prov-ungrounded · grounding chars vs fullSource chars)`);
  for (const r of rows.sort((x, y) => (y.a + y.b) - (x.a + x.b)).slice(0, 20))
    console.log(`  ${r.sol.padEnd(20)} ${r.id}  A=${String(r.a).padStart(3)} B=${String(r.b).padStart(3)} /${String(r.tot).padStart(3)}  prov✗=${String(r.prov).padStart(3)}  ${(r.gLen / 1000).toFixed(0)}k vs ${(r.fLen / 1000).toFixed(0)}k`);
}
console.log("");
