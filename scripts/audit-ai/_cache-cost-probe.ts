import { assembleLensPasses } from "../../src/lib/agentic-sections";
import { readFileSync, readdirSync } from "fs";
// $0 EVIDENCE (card #612-(3)) — this probe REJECTED the producer-prefix-cache (~+26%), so it was deleted from
// the runner. The shared-source builder is inlined here so the documented answer stays runnable.
const buildSharedSolicitationSource = (sectionText: Record<string, string>): string =>
  Object.keys(sectionText).sort()
    .map((k) => { const raw = (sectionText[k] ?? "").trim(); return raw ? `## SECTION ${k}\n${raw}` : ""; })
    .filter(Boolean).join("\n\n");
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
console.log("\nSCENARIO A — ROUTED / DISJOINT bundles (the case the 2026-07-21 ruling tested):");
console.log("  SONNET group (3 lenses, the only cacheable tier)");
console.log("  today cold reads Σ =", sonnetSum, "chars");
const cacheCost = shared.length * 1.25 + 3 * shared.length * 0.10;
console.log("  cache (prime 1.25x + 3 reads 0.10x) =", Math.round(cacheCost), "char-equiv");
console.log("  =>", cacheCost < sonnetSum ? "SAVES" : "COSTS MORE", `(${Math.round((cacheCost/sonnetSum-1)*100)}% vs today)`);

// ── SCENARIO B — WHOLE-SOURCE bundles: the case the ruling did NOT cover ────────────────────────────────────
// The 2026-07-21 rejection rests on one premise, stated in its own note: "lenses read small DISJOINT assigned
// bundles (not full source)". That is TRUE on the routed path and FALSE on every WHOLE-SOURCE path — the #525
// starved-lens fallback, and the #362 blind-aperture rescue, where by construction every lens receives the
// identical full source. The cache cost is IDENTICAL in both scenarios (the shared prefix is the full source
// either way); only the BASELINE moves. So the same probe that rejected the cache for routed packages endorses
// it for whole-source ones. Real banked fullSource, not synthetic.
const REC = "scripts/audit-ai/run-records/_ua-cohort/36C25626Q1137__150c3ab3-9252-40a4-9ed3-49e64547eb70.json";
let wholeSrc = "";
try { wholeSrc = JSON.parse(readFileSync(REC, "utf8"))?.input?.fullSource ?? ""; } catch {}
if (!wholeSrc) { console.log("\nSCENARIO B skipped — banked record unavailable"); }
else {
  // every lens key populated with the SAME full source (what the whole-source paths actually build)
  const LIVE_KEYS = ["A","B","C","H","I","J","L","M"];
  const wholeSectionText: Record<string,string> = Object.fromEntries(LIVE_KEYS.map((k) => [k, wholeSrc]));
  const perLens: Record<string, number> = {};
  let sonnetWhole = 0, otherWhole = 0;
  for (const [k, tier] of Object.entries(LENS)) {
    const { sourceConcat } = assembleLensPasses(k as any, wholeSectionText, {});
    perLens[k] = sourceConcat.length;
    if (tier === "sonnet") sonnetWhole += sourceConcat.length; else otherWhole += sourceConcat.length;
  }
  console.log(`\nSCENARIO B — WHOLE-SOURCE bundles (${REC.split("/").pop()}, fullSource ${wholeSrc.length} chars):`);
  for (const [k, n] of Object.entries(perLens)) console.log(`  ${k} (${LENS[k]}): assigned bundle ${n} chars${n === wholeSrc.length ? "  ← one copy (assembleLensPasses deduped its identical keys)" : ""}`);
  // The shared prefix here is the full source itself — the same magnitude priced in Scenario A.
  const wholeCache = wholeSrc.length * 1.25 + 3 * wholeSrc.length * 0.10;
  console.log("  SONNET group today cold reads Σ =", sonnetWhole, "chars");
  console.log("  cache (prime 1.25x + 3 reads 0.10x) =", Math.round(wholeCache), "char-equiv");
  console.log("  =>", wholeCache < sonnetWhole ? "SAVES" : "COSTS MORE", `(${Math.round((wholeCache/sonnetWhole-1)*100)}% vs today, sonnet group only)`);
  const todayTotal = sonnetWhole + otherWhole;
  const cachedTotal = wholeCache + otherWhole;   // opus + haiku key per-model ⇒ cannot share ⇒ unchanged
  console.log(`  FULL lens phase (opus + haiku cannot share — per-model cache keys):`);
  console.log(`    today  = ${Math.round(todayTotal)} char-equiv`);
  console.log(`    cached = ${Math.round(cachedTotal)} char-equiv`);
  console.log(`    => ${cachedTotal < todayTotal ? "SAVES" : "COSTS MORE"} ${Math.abs(Math.round((cachedTotal/todayTotal-1)*100))}% of the lens phase on a whole-source run`);
}
