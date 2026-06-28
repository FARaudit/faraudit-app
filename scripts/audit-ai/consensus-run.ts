// CONFIRMATION N-RUN HARNESS (Brain card 41 — the frozen grading bar). Runs the agentic panel N=3–5
// times over the cached MAP/sectionText for a package, scores each run against the frozen judgment key,
// and grades the asymmetric consensus (completeness=majority · correctness=zero-tolerance).
//
// PAID (panel fires N times; MAP is reused from the stage6e cache, $0). HELD until CEO greenlight — do
// NOT run as part of routine building. Requires a prior stage6e run to have cached the matrix/sectionText.
//   npx tsx scripts/audit-ai/consensus-run.ts --sol 1240LP26Q0067 --runs 5
import dotenv from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { runPanelJudge, coverageTruth } from "@/lib/agentic-panel-runner";
import { priceUsd, type UsageLike } from "./ab-extract-adapter";
import { scoreJudgment, gradeConsensus, keySha256, type JudgmentKey, type JudgmentResult } from "./judgment-score";
import { setStructuredUsageSink } from "@/lib/anthropic-structured";
import { resolveGoldKey, gradeOosKey } from "./gold-key-resolver";

dotenv.config({ path: ".env.local", quiet: true });
process.env.AUDIT_ENGINE_V2 = "true";

const arg = (k: string, def?: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : def; };
const sol = arg("--sol", "1240LP26Q0067")!;
const N = Math.max(3, Math.min(5, parseInt(arg("--runs", "3")!, 10) || 3));

async function main() {
  const cachePath = path.join("ceo", "proofs", `stage6e-matrix-${sol}.json`);
  const resolved = resolveGoldKey(sol);
  // oos route — deterministic detector, $0; NEVER the paid panel, NEVER scoreJudgment.
  if (resolved.keyType === "oos_detection") {
    const g = gradeOosKey(sol);
    console.log(`oos_detection key '${sol}' → DETECTOR path (no paid panel, scoreJudgment NOT called): ${g.outcome}${g.tier ? ` [${g.tier}] ${g.signals.join(" · ")}` : ""}`);
    console.log(`${g.pass ? "✅ PASS" : "❌ FAIL"} — expected OUT_OF_SCOPE construction.`);
    process.exit(g.pass ? 0 : 2);
  }
  const fkPath = resolved.path;        // ACTIVE key (not the retired `${sol}.judgment.frozen.json`)
  for (const [label, p] of [["matrix cache (run stage6e first)", cachePath], ["frozen key", fkPath]] as const)
    if (!existsSync(p)) { console.error(`⛔ ${label} MISSING: ${p}`); process.exit(1); }

  const { sectionText, detected } = JSON.parse(readFileSync(cachePath, "utf8")) as { sectionText: Record<string, string>; detected: string[] };
  const jkey = JSON.parse(readFileSync(fkPath, "utf8")) as JudgmentKey;
  const recomputed = keySha256(jkey);
  if (jkey.adjudication?.keySha256 && jkey.adjudication.keySha256 !== recomputed) {
    console.error(`⛔ keySha256 mismatch (frozen ${jkey.adjudication.keySha256.slice(0, 12)}… ≠ ${recomputed.slice(0, 12)}…) — INVALID`); process.exit(1);
  }
  console.log(`══ CONSENSUS N-RUN · ${sol} · N=${N} · keySha256 ✅ ${recomputed.slice(0, 8)} ══`);

  const sourceLedgerText = Object.values(sectionText).join("\n");
  const results: JudgmentResult[] = [];
  let totalUsd = 0;

  for (let r = 0; r < N; r++) {
    const usage: UsageLike[] = [];
    setStructuredUsageSink((u) => usage.push(u));
    const panel = await runPanelJudge({ sectionText, detectedSections: new Set(detected), unroutedBinding: [] });
    setStructuredUsageSink(null);
    totalUsd += priceUsd(usage).usd;
    if (!panel.fired || !panel.judgment) { console.log(`run ${r + 1}: panel did not fire — INCOMPLETE`); continue; }

    const raised = panel.panelists.flatMap((p) => p.output?.named_hard_gates.map((g) => ({ name: g.gate, met: g.met, cite: g.citation })) ?? []);
    const pv = {
      verdict: panel.judgment.verdict, eligible: panel.judgment.eligible,
      showStoppers: panel.judgment.show_stoppers.length, raisedGates: raised,
      showStopperTexts: (panel.judgment.show_stoppers ?? []).map((s) => typeof s === "string" ? s : ((s as { finding?: string }).finding ?? JSON.stringify(s))),
    };
    const analysisText = [
      String(panel.judgment.rationale ?? ""),
      ...(panel.judgment.preserved_dissent ?? []).map((d) => typeof d === "string" ? d : JSON.stringify(d)),
      ...((panel.verifier?.claims ?? []) as Array<{ evidence?: string }>).map((c) => typeof c === "string" ? c : JSON.stringify(c)),
      ...raised.map((g) => `${g.name} ${g.cite ?? ""}`),
    ].join(" \n ");
    const jr = scoreJudgment(pv, jkey, sourceLedgerText, { extractedClauses: [], analysisText });
    results.push(jr);
    const cov = coverageTruth(panel);
    console.log(`run ${r + 1}: ${cov.complete ? "COMPLETE" : "INCOMPLETE"} · verdict ${jr.verdict.actual} ${jr.verdict.ok ? "✅" : "❌"} · fab ${jr.fabricated.length ? "❌" + jr.fabricated.join(",") : "✅"} · disqual-misfire ${jr.decoyHardFails.length ? "❌" + jr.decoyHardFails.join(",") : "✅"} · disposition-misfile ${jr.dispositionMisfiles.length ? "⚠" + jr.dispositionMisfiles.join(",") : "✅"}`);
  }

  console.log(`\n──────── CONSENSUS (N=${results.length}) ────────`);
  const con = gradeConsensus(results, jkey);
  console.log(`completeness: verdict ok ${con.completeness.verdictOkRuns}/${con.n} (maj ${con.majority}) · concepts: ${con.completeness.conceptConsensus.map((c) => `${c.token}:${c.surfacedRuns}/${con.n}${c.ok ? "✅" : "❌"}`).join(" · ")}`);
  console.log(`disposition-misfile (Tier 2, consensus): ${con.completeness.dispositionMisfileConsensus.length ? con.completeness.dispositionMisfileConsensus.map((m) => `${m.token}:${m.misfiledRuns}/${con.n}${m.fail ? "❌" : "✅"}`).join(" · ") : "✅ none"}`);
  console.log(`correctness (Tier 1, zero-tolerance): fabrication ${con.correctness.fabricationRuns.length ? "❌ " + con.correctness.fabricationRuns.join(" · ") : "✅ none"} · disqualifying-misfire ${con.correctness.misclassificationRuns.length ? "❌ " + con.correctness.misclassificationRuns.join(" · ") : "✅ none"}`);
  console.log(`\nCONSENSUS GRADE: ${con.pass ? "✅ PASS" : "❌ FAIL — " + con.failures.join(" · ")}`);
  console.log(`\nPANEL COST (N=${results.length}, in-code): $${totalUsd.toFixed(2)} (Console CSV delta authoritative)`);
}
main().catch((e) => { console.error("CONSENSUS-RUN ERROR:", e); process.exit(1); });
