/* PHASE 5 $0 CERT — passiveFrameEligBarSentence vs the R1 labeled corpus (card #560).
 * Oracle: manifest.json rows.R1_prefilter_miss — label ∈ {true_bar → FLAG, performance_skip → SKIP}.
 * Target: 31/31 (12 true_bar FLAG · 19 performance_skip SKIP). Run: npx tsx scripts/audit-ai/_cert-phase5-passive-corpus.ts
 */
import { readFileSync } from "fs";
import { passiveFrameEligBarSentence } from "../../src/lib/audit-orchestrator";

const m = JSON.parse(readFileSync("scripts/audit-ai/gate2-corpus/manifest.json", "utf8"));
const r1: Array<{ id: string; label: string; sentence: string; shape: string; origin: string; label_note?: string }> = m.rows.R1_prefilter_miss;

let flagMiss = 0, skipMiss = 0, ok = 0;
const fails: string[] = [];
for (const s of r1) {
  const want = s.label === "true_bar";                 // true_bar ⇒ MUST FLAG; performance_skip ⇒ MUST SKIP
  const got = passiveFrameEligBarSentence(s.sentence);
  const pass = got === want;
  if (pass) ok++;
  else {
    if (want && !got) { flagMiss++; fails.push(`UNDER-FIRE (should FLAG, got SKIP) ${s.id} [${s.shape}]\n     ${s.sentence.slice(0, 140).replace(/\n/g, " ")}`); }
    else { skipMiss++; fails.push(`OVER-FIRE  (should SKIP, got FLAG) ${s.id} [${s.shape}]\n     ${s.sentence.slice(0, 140).replace(/\n/g, " ")}`); }
  }
}
console.log(`\n=== PHASE 5 R1 corpus cert: ${ok}/${r1.length} ===`);
console.log(`   UNDER-FIRE (bar slipped, HARD ZERO): ${flagMiss}`);
console.log(`   OVER-FIRE  (crying wolf):            ${skipMiss}\n`);
for (const f of fails) console.log(" ❌ " + f);
if (!fails.length) console.log(" ✅ all 31 specimens classified correctly");
process.exit(fails.length ? 1 : 0);
