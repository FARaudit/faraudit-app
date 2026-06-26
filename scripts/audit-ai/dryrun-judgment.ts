// $0 DRY-RUN — prove the judgment-scorer harness consumes a REAL stage6e panel output end-to-end.
// NO model calls, NO paid API, NO commit. Replicates stage6e-panel-proof.ts's EXACT adapter
// (panelists.named_hard_gates → raisedGates; judgment → verdict/eligible/showStoppers) so the
// plumbing under test is the real one, not a re-implementation.
//
// Usage: npx tsx scripts/audit-ai/dryrun-judgment.ts --sol N4008526R0065 \
//          --panel ceo/proofs/stage6e-panel-output-N4008526R0065.json
//
// IMPORTANT: a CACHED panel output proves the HARNESS (shape ingests cleanly). It is a valid
// #1 GRADUATION result ONLY if the engine is unchanged since that output was produced — otherwise
// the gates are stale and a fresh paid run is required for the real pilot. This script reports the
// plumbing result and the LOCKED bar's hard-fail verdict; it does NOT assert graduation.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { scoreJudgment, keySha256, type JudgmentKey } from "./judgment-score";
import type { PanelVerdictLike } from "./gold-set-score";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const sol = arg("sol", "N4008526R0065")!;
const panelPath = arg("panel", `ceo/proofs/stage6e-panel-output-${sol}.json`)!;
const dir = "scripts/audit-ai/gold-sets";
const fkPath = path.join(dir, `${sol}.judgment.frozen.json`);
const srcPath = path.join(dir, `${sol}-FULL-SOURCE.txt`);

for (const [label, p] of [["panel output", panelPath], ["frozen key", fkPath], ["source", srcPath]] as const) {
  if (!existsSync(p)) { console.error(`⛔ ${label} MISSING: ${p}`); process.exit(1); }
}

const panel = JSON.parse(readFileSync(panelPath, "utf8"));
const jkey = JSON.parse(readFileSync(fkPath, "utf8")) as JudgmentKey;
const sourceText = readFileSync(srcPath, "utf8");

// integrity gate — exactly as stage6e: keySha256 mismatch ⇒ INVALID, do not score.
const recomputed = keySha256(jkey);
const stamped = jkey.adjudication?.keySha256 ?? "";
if (stamped && stamped !== recomputed) {
  console.error(`⛔ JUDGMENT KEY INVALID — keySha256 ${stamped.slice(0, 12)}… ≠ recomputed ${recomputed.slice(0, 12)}…`);
  process.exit(1);
}
console.log(`keySha256 ${stamped ? (stamped === recomputed ? "✅ MATCH" : "MISMATCH") : "(unstamped)"} (${recomputed.slice(0, 12)}…)`);

// stage6e's EXACT adapter (lines 259-260):
const raised = (panel.panelists ?? []).flatMap((p: any) =>
  p.output?.named_hard_gates?.map((g: any) => ({ name: g.gate, met: g.met, cite: g.citation })) ?? []);
const pv: PanelVerdictLike = {
  verdict: panel.judgment.verdict,
  eligible: panel.judgment.eligible,
  showStoppers: panel.judgment.show_stoppers.length,
  raisedGates: raised,
  showStopperTexts: (panel.judgment.show_stoppers ?? []).map((s: { finding?: string } | string) => typeof s === "string" ? s : (s.finding ?? JSON.stringify(s))),
};

console.log(`\nINPUT (from real cached panel output, ${(readFileSync(panelPath).length / 1024).toFixed(0)} KB):`);
console.log(`  verdict=${pv.verdict} · eligible=${pv.eligible} · showStoppers=${pv.showStoppers} · raisedGates=${raised.length} (met=${raised.filter((r: any) => r.met).length}/unmet=${raised.filter((r: any) => !r.met).length})`);

// "anywhere in output" corpus (Brain Option A, 2026-06-26): judge rationale + dissent + verifier claims + gate names.
const analysisText = [
  String(panel.judgment?.rationale ?? ""),
  ...(panel.judgment?.preserved_dissent ?? []).map((d: any) => typeof d === "string" ? d : JSON.stringify(d)),
  ...(panel.verifier?.claims ?? []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
  ...raised.map((r: any) => `${r.name} ${r.cite ?? ""}`),
].join(" \n ");
const jr = scoreJudgment(pv, jkey, sourceText, { extractedClauses: [], analysisText }); // Part advisory in dry-run (no map.facts)

console.log(`\n──────── JUDGMENT SCORE · frozen key · deterministic · $0 · NO AI ────────`);
console.log(`part        ${jr.partClassification.ok ? "✅" : "⚠️ ADVISORY"} (${jr.partClassification.actual} vs ${jr.partClassification.expected})`);
console.log(`verdict     ${jr.verdict.ok ? "✅" : "❌"} (${jr.verdict.actual})`);
console.log(`fabrication ${jr.fabricated.length === 0 ? "✅" : "❌ " + jr.fabricated.join(",")}`);
console.log(`decoy       ${jr.decoyHardFails.length === 0 ? "✅" : "❌ " + jr.decoyHardFails.join(",")}`);
console.log(`concepts    ${jr.namedGates.map((g) => {
  const hardMiss = !g.surfaced && jr.failures.some((f) => f.includes(`'${g.token}'`));
  return `${g.token}:${g.surfaced ? "✅" : (hardMiss ? "❌HARD" : "·adv")}`;
}).join(" · ")}  (❌HARD = mustRaise miss; ·adv = advisory)`);
console.log(`dispositn   ${jr.dispositionAdvisories.length ? "⚠️ " + jr.dispositionAdvisories.join(" · ") : "all aligned"}  (advisory)`);
console.log(`show-stop   ${jr.showStoppers.map((s) => s.surfaced ? "✅" : "⚠️").join("")} (advisory per locked bar)`);

// Apply the LOCKED bar (Brain Option A 2026-06-26): hard = fabrication + decoy + verdict + concept-presence miss.
// Part + show-stopper + disposition are ADVISORY (disposition failures no longer reach jr.failures at all).
const HARD = jr.failures.filter((f) => !/^PART |show-stopper not surfaced/.test(f));
console.log(`\nLOCKED-BAR hard failures: ${HARD.length === 0 ? "0 → ✅ package PASSES (under locked bar)" : HARD.length + " → ❌ package FAILS\n  - " + HARD.join("\n  - ")}`);
