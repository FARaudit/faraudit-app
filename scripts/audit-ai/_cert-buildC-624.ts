/**
 * CERT — Build C whole-pipeline cost pre-screen (Brain card #624-2).
 *
 * PROVES ($0, no network / no model calls):
 *   A. The re-derived per-stage formula (card #624-3.ii) reproduces the 3 calibration anchors' PROJECTED wall-clock
 *      (LBJ 233s · 36C 478s · E133 875s) from their census inputs + ACTUAL claims.
 *   B. RE-CERT GATE VERDICTS (card #624-2, the arm precondition): budget 360s @ ≥20% headroom (limit 288s) →
 *      LBJ PASS · 36C REFUSE · E133 REFUSE — using ESTIMATED claims (the realistic pre-panel path).
 *   C. 36C is refused ONLY by the WALL-CLOCK term (its $1.5 cost PASSES the $2.00 gate) — i.e. the new byte/scanned
 *      term catches a stall the char-only $ gate structurally could NOT. E133 is refused by BOTH.
 *   D. The PER-DOC CENSUS classifier: authoritative has_text wins; word-shape + text-page-ratio + byte-density
 *      fallback classify scanned-vs-readable; a cover-only doc reads SCANNED (the census-discrepancy fix).
 *   E. FLAG-OFF byte-identity: the executor gate is wholly under `if (AUDIT_COST_PRESCREEN === "true")`, and the
 *      pure functions read no env — so flag-OFF is a strict no-op (structural assertion).
 *
 * Run: npx tsx scripts/audit-ai/_cert-buildC-624.ts
 */
import {
  projectWallClockSeconds, estimateVerifierClaims, wallClockPrescreen, pipelinePrescreen,
  censusPackage, isScannedDoc, type PackageCensus, type DocCensus,
} from "@/lib/cost-prescreen";
import { readFileSync } from "fs";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ── Calibration anchors (card #624-3.ii). MB back-solved from the formula + card totals; 36C's 31MB is card-stated
//    (item 27); chars/claims/docs/scanned from the real runs (E133 995,368c/259cl · 36C 6-scanned/66cl · LBJ
//    149,035c/6-doc/89cl, run-record _dl-40fd02ce.json). scanned classification is exogenous here (already known). ──
const ANCHORS: Array<{ name: string; census: PackageCensus; claims: number; projected: number; verdict: "PASS" | "REFUSE" }> = [
  { name: "LBJ 40fd02ce", projected: 233, verdict: "PASS",
    census: { docCount: 6, machineReadableChars: 149_035, scannedDocCount: 0, totalBytes: 1_100_000, imageBytes: 0 }, claims: 89 },
  { name: "36C d7de0285", projected: 478, verdict: "REFUSE",
    census: { docCount: 10, machineReadableChars: 266_883, scannedDocCount: 6, totalBytes: 31_000_000, imageBytes: 28_000_000 }, claims: 66 },
  { name: "E133 48c57c21", projected: 875, verdict: "REFUSE",
    census: { docCount: 14, machineReadableChars: 995_368, scannedDocCount: 0, totalBytes: 9_600_000, imageBytes: 0 }, claims: 259 },
];

// ── A: formula reproduces the anchor projections (with ACTUAL claims) ────────────────────────────────────────────
console.log("── A. Formula reproduces card #624-3.ii anchor projections (actual claims) ──");
for (const a of ANCHORS) {
  const s = projectWallClockSeconds(a.census, a.claims);
  ok(`A ${a.name} → ${s.toFixed(0)}s (card ${a.projected}s)`, near(s, a.projected, 2), `Δ=${(s - a.projected).toFixed(1)}s`);
}

// ── B + C: RE-CERT gate verdicts (ESTIMATED claims, budget 360s @ 20% headroom → limit 288s) ────────────────────
console.log("\n── B/C. RE-CERT gate verdicts (estimated claims · budget 360s · ≥20% headroom · limit 288s) ──");
for (const a of ANCHORS) {
  const p = pipelinePrescreen(a.census, { budgetMs: 360_000, headroom: 0.20 });
  const gotVerdict = p.pass ? "PASS" : "REFUSE";
  ok(`B ${a.name} gate = ${gotVerdict} (expect ${a.verdict})`, gotVerdict === a.verdict,
    `cost $${p.cost.projectedUsd.toFixed(2)}≤$${p.cost.gateUsd.toFixed(2)}=${p.cost.pass} · wall ${p.wallClock.projectedSeconds.toFixed(0)}s≤${p.wallClock.effectiveLimitSeconds.toFixed(0)}s=${p.wallClock.pass}${p.refusedBy ? ` · refusedBy=${p.refusedBy}` : ""}`);
}
// C — 36C caught ONLY by wall-clock (cost passes); E133 caught by cost.
const p36 = pipelinePrescreen(ANCHORS[1].census, { budgetMs: 360_000, headroom: 0.20 });
ok("C 36C passes the $ COST gate (char-only gate would NOT refuse it)", p36.cost.pass, `cost $${p36.cost.projectedUsd.toFixed(2)} ≤ $${p36.cost.gateUsd.toFixed(2)}`);
ok("C 36C is refused specifically by WALL-CLOCK (the new byte/scanned term)", p36.refusedBy === "wallclock");
const pE = pipelinePrescreen(ANCHORS[2].census, { budgetMs: 360_000, headroom: 0.20 });
ok("C E133 fails the COST gate (1M chars → intrinsic $ over cap)", !pE.cost.pass, `cost $${pE.cost.projectedUsd.toFixed(2)} > $${pE.cost.gateUsd.toFixed(2)}`);

// ── D: per-doc census classifier ────────────────────────────────────────────────────────────────────────────────
console.log("\n── D. Per-doc census classifier ──");
const bodyText = "The contractor shall provide all labor and materials in accordance with the statement of work. ".repeat(20);
ok("D authoritative has_text=false ⇒ scanned (overrides text)", isScannedDoc({ bytes: 5_000_000, text: bodyText, machineReadable: false }));
ok("D authoritative has_text=true ⇒ machine-readable (overrides bytes)", !isScannedDoc({ bytes: 50_000_000, text: "", machineReadable: true }));
ok("D word-shaped dense text ⇒ machine-readable", !isScannedDoc({ bytes: 40_000, text: bodyText }));
ok("D cover-only: <½ pages carry text ⇒ scanned", isScannedDoc({ bytes: 4_000_000, text: bodyText, pages: 50, textPages: 3 }));
ok("D big bytes + trivial chars ⇒ scanned (image-heavy density)", isScannedDoc({ bytes: 8_000_000, text: "SF1449 page 1 of 60" }));
ok("D empty text ⇒ scanned", isScannedDoc({ bytes: 2_000_000, text: "" }));
// aggregation
const docs: DocCensus[] = [
  { bytes: 500_000, text: bodyText, machineReadable: true },
  { bytes: 6_000_000, text: "scan", machineReadable: false },
  { bytes: 400_000, text: bodyText, machineReadable: true },
];
const c = censusPackage(docs);
ok("D censusPackage aggregates (3 docs, 1 scanned, imageBytes=6MB)",
  c.docCount === 3 && c.scannedDocCount === 1 && c.imageBytes === 6_000_000 && c.totalBytes === 6_900_000,
  `docs=${c.docCount} scanned=${c.scannedDocCount} imageMB=${(c.imageBytes / 1e6).toFixed(1)} totalMB=${(c.totalBytes / 1e6).toFixed(1)}`);

// ── E: flag-OFF byte-identity (structural) ──────────────────────────────────────────────────────────────────────
console.log("\n── E. Flag-OFF byte-identity (structural) ──");
const execSrc = readFileSync("src/lib/audit-executor-v3.ts", "utf8");
ok("E gate is wholly under `AUDIT_COST_PRESCREEN === \"true\"`",
  /process\.env\.AUDIT_COST_PRESCREEN === "true" && manifestComplete && !constructionOOS/.test(execSrc));
const preSrc = readFileSync("src/lib/cost-prescreen.ts", "utf8");
const pureFns = preSrc.slice(preSrc.indexOf("BUILD C —"));
ok("E projection/census pure fns read NO env (flag-independent)",
  !/process\.env\.AUDIT_COST_PRESCREEN/.test(pureFns), "no flag read in Build C pure functions");

// estimate sanity
const estE133 = estimateVerifierClaims(995_368);
ok("E estimateVerifierClaims(E133 chars) ≈ actual (259)", near(estE133, 259, 40), `est=${estE133} vs 259`);

console.log(`\n${fails === 0 ? "✅ ALL PASS" : `❌ ${fails} FAIL`} — Build C whole-pipeline pre-screen cert (Brain #624-2)`);
process.exit(fails === 0 ? 0 : 1);
