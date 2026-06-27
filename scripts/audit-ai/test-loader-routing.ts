// $0 verification for the registry-aware loaders + scoreJudgment guard (Brain card 71). NO paid runs.
//   npx tsx scripts/audit-ai/test-loader-routing.ts
import { readFileSync } from "node:fs";
import { resolveGoldKey, gradeOosKey } from "./gold-key-resolver";
import { scoreJudgment, type JudgmentKey } from "./judgment-score";
import type { PanelVerdictLike } from "./gold-set-score";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };
const dummyPv: PanelVerdictLike = { verdict: "BID", eligible: true, showStoppers: 0, raisedGates: [], showStopperTexts: [] };

console.log("── resolver: registry resolves the ACTIVE key per sol (not the retired .json) ──");
const r4 = resolveGoldKey("AOCSSB26R0023");
ok(r4.file === "AOCSSB26R0023.judgment.frozen.v3.json" && r4.keyType === "full_verdict", `#4 → ${r4.file} (${r4.keyType}) — v3 gradeable schema, NOT retired v1/v2`);
const r5 = resolveGoldKey("FA667024R0001");
ok(r5.file === "FA667024R0001.judgment.frozen.v2.json" && r5.keyType === "oos_detection", `#5 → ${r5.file} (${r5.keyType})`);
for (const s of ["N4008526R0065", "1240LP26Q0067", "SPRDL125Q0030"]) {
  const r = resolveGoldKey(s);
  ok(r.keyType === "full_verdict" && r.file.endsWith(".judgment.frozen.json"), `${s} → ${r.file} (${r.keyType})`);
}

console.log("── routing: oos sol grades via the detector, never scoreJudgment ──");
const g5 = gradeOosKey("FA667024R0001");
ok(g5.pass && g5.outcome === "OUT_OF_SCOPE", `#5 detector → ${g5.outcome}${g5.tier ? ` [${g5.tier}] ${g5.signals.join(" · ")}` : ""}`);

console.log("── crash-proof: oos key forced into scoreJudgment → NAMED throw (not a crash) ──");
for (const [label, file] of [["#5 oos key", r5.path]] as const) {
  const k = JSON.parse(readFileSync(file, "utf8")) as JudgmentKey;
  let msg = "", named = false;
  try { scoreJudgment(dummyPv, k, "source text"); } catch (e) { msg = e instanceof Error ? e.message : String(e); named = /scoreJudgment: non-full_verdict or malformed key/.test(msg); }
  ok(named, `${label} → ${named ? `named throw ("${msg.slice(0, 64)}…")` : (msg ? "WRONG error: " + msg.slice(0, 50) : "DID NOT THROW")}`);
}

console.log("── regression: full_verdict keys (v1 + #4 v3 gradeable schema) pass the guard (scoreJudgment runs) ──");
for (const s of ["N4008526R0065", "1240LP26Q0067", "SPRDL125Q0030", "AOCSSB26R0023"]) {
  const k = JSON.parse(readFileSync(resolveGoldKey(s).path, "utf8")) as JudgmentKey;
  let guardThrew = false;
  try { scoreJudgment(dummyPv, k, "source text"); } catch (e) { if (/non-full_verdict or malformed/.test(e instanceof Error ? e.message : "")) guardThrew = true; }
  ok(!guardThrew, `${s} active full_verdict key → guard does NOT throw (routes to scoreJudgment)`);
}

if (fail) { console.error(`\n✗ ${fail} routing/guard check(s) FAILED`); process.exit(1); }
console.log("\n✓ all routing/guard checks pass: registry resolves active keys; oos→detector; oos/malformed→named throw; v1 keys unaffected.");
