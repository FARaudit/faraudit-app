/* PHASE 5 GAUNTLET JUDGE — runs the adversarial red-team specimens (A over-fire + B under-fire) + the R1 corpus through
 * passiveFrameEligBarSentence and reports every mismatch vs the specimen's expected label.
 * UNDER-FIRE (expected flag, got skip) = HARD ZERO. OVER-FIRE (expected skip, got flag) = crying-wolf.
 * Run: npx tsx scripts/audit-ai/_cert-phase5-gauntlet-judge.ts
 */
import { readFileSync } from "fs";
import { passiveFrameEligBarSentence } from "../../src/lib/audit-orchestrator";

type Spec = { id: string; sentence: string; expected: string; vein?: string; shape?: string; label?: string; rationale?: string; label_note?: string };
const load = (p: string): Spec[] => JSON.parse(readFileSync(p, "utf8"));
const corpus = JSON.parse(readFileSync("scripts/audit-ai/gate2-corpus/manifest.json", "utf8")).rows.R1_prefilter_miss
  .map((s: any) => ({ id: "R1:" + s.id, sentence: s.sentence, expected: s.label === "true_bar" ? "flag" : "skip", vein: s.shape, rationale: s.label_note }));

const sets: Array<[string, Spec[]]> = [
  ["R1-corpus", corpus],
  ["A-overfire", load("ceo/phase5-gauntlet/redteam-A-overfire.json")],
  ["B-underfire", load("ceo/phase5-gauntlet/redteam-B-underfire.json")],
  ["R2-overfire", load("ceo/phase5-gauntlet/redteam-R2-overfire.json")],
  ["R3-confirm", load("ceo/phase5-gauntlet/redteam-R3-confirm.json")],
  ["R4-newnouns", load("ceo/phase5-gauntlet/redteam-R4-newnouns.json")],
];

let under = 0, over = 0, okAll = 0, total = 0;
for (const [name, specs] of sets) {
  const under0: Spec[] = [], over0: Spec[] = [];
  for (const s of specs) {
    total++;
    const want = s.expected === "flag";
    const got = passiveFrameEligBarSentence(s.sentence);
    if (got === want) { okAll++; continue; }
    if (want && !got) under0.push(s); else over0.push(s);
  }
  under += under0.length; over += over0.length;
  console.log(`\n=== ${name}: ${specs.length - under0.length - over0.length}/${specs.length} ===`);
  for (const s of under0) console.log(` 🔴 UNDER (want FLAG got skip) ${s.id} [${s.vein || ""}]\n     ${s.sentence.slice(0, 150)}\n     WHY: ${s.rationale || ""}`);
  for (const s of over0) console.log(` �amber OVER (want SKIP got flag) ${s.id} [${s.vein || ""}]\n     ${s.sentence.slice(0, 150)}\n     WHY: ${s.rationale || ""}`);
}
console.log(`\n──────────\nTOTAL ${okAll}/${total}   UNDER-FIRE=${under} (hard zero)   OVER-FIRE=${over} (crying wolf)`);
