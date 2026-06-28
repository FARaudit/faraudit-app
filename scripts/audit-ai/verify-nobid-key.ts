// $0 VERIFY for the NO_BID synthetic gold key (Brain card 72 build). NO paid runs — the paid grade-PASS
// run is the CEO-greenlit graduation step and is NOT performed here.
//   npx tsx scripts/audit-ai/verify-nobid-key.ts
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolveGoldKey, gradeOosKey } from "./gold-key-resolver";
import { scoreJudgment, keySha256, type JudgmentKey } from "./judgment-score";
import { detectConstructionOutOfScope } from "../../src/lib/section-boundary-detector";
import type { PanelVerdictLike } from "./gold-set-score";

const SOL = "FA860126Q00260001";
const GOLD = "scripts/audit-ai/gold-sets";
const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const rows: Array<{ check: string; result: string; pass: boolean }> = [];
const add = (check: string, pass: boolean, result: string) => rows.push({ check, result, pass });
const dummyPv: PanelVerdictLike = { verdict: "NO_BID", eligible: true, showStoppers: 1, raisedGates: [], showStopperTexts: [] };

// 1. parses
let key: JudgmentKey | null = null;
try { key = JSON.parse(readFileSync(`${GOLD}/${SOL}.judgment.frozen.SYNTHETIC.json`, "utf8")) as JudgmentKey; add("key parses (valid JSON)", true, "OK"); }
catch (e) { add("key parses (valid JSON)", false, String(e)); }

if (key) {
  // 2. sha recompute == stamped
  const recomputed = keySha256(key);
  const stamped = key.adjudication?.keySha256 ?? "";
  add("keySha256 recompute == stamped", recomputed === stamped, `${recomputed.slice(0, 12)}… ${recomputed === stamped ? "==" : "≠"} ${stamped.slice(0, 12)}…`);

  // 2b. source_sha256 recompute == stamped (the synthetic source file is immutable too)
  const srcRe = fileSha(`${GOLD}/${SOL}-FULL-SOURCE.complete.txt`);
  const srcStamp = (key as unknown as Record<string, string>).source_sha256 ?? "";
  add("source_sha256 recompute == stamped", srcRe === srcStamp, `${srcRe.slice(0, 12)}… ${srcRe === srcStamp ? "==" : "≠"} ${srcStamp.slice(0, 12)}…`);

  // 4. scoreJudgment guard does NOT throw (valid full_verdict key)
  let guardThrew = false, otherErr = "";
  try { scoreJudgment(dummyPv, key, "x"); } catch (e) { const m = e instanceof Error ? e.message : String(e); if (/non-full_verdict or malformed/.test(m)) guardThrew = true; else otherErr = m; }
  add("scoreJudgment guard does NOT throw", !guardThrew, guardThrew ? "guard threw (WRONG)" : otherErr ? `ran past guard; non-guard err: ${otherErr.slice(0, 40)}` : "guard passed; scoreJudgment ran");

  // 5. resolver routes new key → scoreJudgment (NOT detector)
  const r = resolveGoldKey(SOL);
  const routeOk = r.keyType === "full_verdict" && r.file === `${SOL}.judgment.frozen.SYNTHETIC.json`;
  add("resolver routes → full_verdict (scoreJudgment, NOT detector)", routeOk, `${r.file} (${r.keyType}, ${r.activeVersion})`);

  // 6. detector NEGATIVE replay: 334511 thermal does NOT trip OOS (explicit naics + the real source text)
  const text = readFileSync(`${GOLD}/${SOL}-FULL-SOURCE.complete.txt`, "utf8");
  const detExplicit = detectConstructionOutOfScope({ naicsCode: "334511", fullText: text });
  add("detector negative replay (naics 334511 + source) → NO trip", detExplicit === null, detExplicit === null ? "null (in-scope, correct)" : `TRIPPED [${detExplicit.tier}] ${detExplicit.matchedSignals.join(", ")}`);
  // also via the gradeOosKey path (extracts naics from source) — must report in-scope (detector did NOT fire)
  const g = gradeOosKey(SOL);
  add("detector negative replay (gradeOosKey path) → in-scope", !g.pass && /in-scope/.test(g.outcome), g.outcome);
}

// 7. registry counts: full_verdict=5 · oos_detection=1; new key active, supersedes []
const reg = JSON.parse(readFileSync(`${GOLD}/gold-set-registry.json`, "utf8")) as { keys: Record<string, { key_type: string; pole?: string; supersedes?: unknown }> };
const fv = Object.values(reg.keys).filter((k) => k.key_type === "full_verdict").length;
const oos = Object.values(reg.keys).filter((k) => k.key_type === "oos_detection").length;
add("registry counts: full_verdict=5 · oos_detection=1", fv === 5 && oos === 1, `full_verdict=${fv} · oos_detection=${oos}`);
const ne = reg.keys[SOL];
add("new key registered active full_verdict/NO_BID, supersedes []", !!ne && ne.key_type === "full_verdict" && ne.pole === "NO_BID" && Array.isArray(ne.supersedes) && (ne.supersedes as unknown[]).length === 0, ne ? `${ne.key_type}/${ne.pole}, supersedes=${JSON.stringify(ne.supersedes)}` : "MISSING");

// 8. regression #1–#5: active keys recompute==stamped; retired files byte-identical to registry retired_sha256
console.log("── regression #1–#5 (pre-existing keys unchanged) ──");
let regr = true;
for (const s of ["N4008526R0065", "1240LP26Q0067", "SPRDL125Q0030", "AOCSSB26R0023", "FA667024R0001"]) {
  const rr = resolveGoldKey(s);
  if (rr.keyType === "full_verdict") {
    const k = JSON.parse(readFileSync(rr.path, "utf8")) as JudgmentKey;
    const okk = keySha256(k) === k.adjudication?.keySha256;
    add(`  #${s} active key recompute==stamped`, okk, okk ? "✅" : "MISMATCH"); regr = regr && okk;
  } else {
    add(`  #${s} active oos key (no scoreJudgment hash) — file present`, true, rr.file);
  }
}
// retired files byte-identical to the shas recorded in the registry
const retired: Array<[string, string]> = [];
for (const e of Object.values(reg.keys) as Array<{ supersedes?: unknown }>) {
  const sup = e.supersedes;
  const arr = Array.isArray(sup) ? sup : sup ? [sup] : [];
  for (const s of arr as Array<{ file: string; retired_sha256?: string }>) if (s.retired_sha256) retired.push([s.file, s.retired_sha256]);
}
for (const [f, sha] of retired) {
  const actual = fileSha(`${GOLD}/${f}`);
  add(`  retired ${f} byte-identical`, actual === sha, actual === sha ? "✅ unchanged" : `CHANGED ${actual.slice(0, 12)}…`);
}

// ── print table ──
const w = Math.max(...rows.map((r) => r.check.length));
console.log("\n┌─ NO_BID KEY VERIFY TABLE " + "─".repeat(Math.max(0, w - 12)));
for (const r of rows) console.log(`│ ${r.pass ? "✅" : "❌"} ${r.check.padEnd(w)}  ${r.result}`);
console.log("└" + "─".repeat(w + 28));
const failed = rows.filter((r) => !r.pass);
if (failed.length) { console.error(`\n✗ ${failed.length} check(s) FAILED`); process.exit(1); }
console.log("\n✓ ALL VERIFY CHECKS PASS — NO_BID key frozen, registered, routed, detector-clean, regression-clean. Paid grade-run NOT performed (CEO-gated).");
