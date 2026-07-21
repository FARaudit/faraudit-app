import { assembleLensPasses } from "../../src/lib/agentic-sections";
import { buildSharedSolicitationSource } from "../../src/lib/agentic-panel-runner";
import { readFileSync, readdirSync } from "fs";
const dir = "scripts/audit-ai/run-records";
let sectionText: Record<string,string> | null = null;
let usedFile = "";
try {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let j: any; try { j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch { continue; }
    const st = j?.panelInputs?.sectionText ?? j?.sectionText ?? j?.inputs?.sectionText;
    if (st && typeof st === "object" && Object.keys(st).length >= 3) { sectionText = st; usedFile = f; break; }
  }
} catch {}
if (!sectionText) { usedFile = "(synth)"; sectionText = { A:"a".repeat(3000), B:"b".repeat(20000), C:"c".repeat(40000), H:"h".repeat(15000), I:"i".repeat(18000), J:"j".repeat(5000), L:"l".repeat(25000), M:"m".repeat(12000) }; }
console.log("source:", usedFile, "· sections:", Object.keys(sectionText).join(","));
const LENS: Record<string,string> = { capture_strategist:"sonnet", proposal_compliance:"sonnet", source_selection_evaluator:"opus", pricing_contracts_risk:"sonnet", smallbiz_eligibility_counsel:"haiku" };
const shared = buildSharedSolicitationSource(sectionText);
console.log("shared full-source chars:", shared.length);
let sonnetSum = 0;
for (const [k, tier] of Object.entries(LENS)) {
  const { sourceConcat } = assembleLensPasses(k as any, sectionText, {});
  if (tier === "sonnet") sonnetSum += sourceConcat.length;
  console.log(`  ${k} (${tier}): assigned bundle ${sourceConcat.length} chars`);
}
console.log("\nSONNET group (3 lenses, the only cacheable tier):");
console.log("  today cold reads Σ =", sonnetSum, "chars");
const cacheCost = shared.length * 1.25 + 3 * shared.length * 0.10;
console.log("  cache (prime 1.25x + 3 reads 0.10x) =", Math.round(cacheCost), "char-equiv");
console.log("  =>", cacheCost < sonnetSum ? "SAVES" : "COSTS MORE", `(${Math.round((cacheCost/sonnetSum-1)*100)}% vs today)`);
