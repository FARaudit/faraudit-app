// Card #593 — FULL-PATH GATE ENUMERATION. Force-walk deriveVerdict on banked 40fd02ce to a BWC/BID render:
// at each NHR/NO_BID, record the gate, then satisfy it in simulation (verifierSound:=true; neutralize the
// blocking findings the same way the relevant fix would) and re-derive. Produces the COMPLETE ordered gate list.
// $0, analysis-only — never mutates the record or the engine.
import { readFileSync } from "fs";
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_refire-40fd02ce.json", "utf8"));
// FAITHFUL REPLAY: hydrate process.env from the record's banked flagEnv (#582) BEFORE importing the engine, so the
// module-level import-time consts (GATE_V2_ENABLED, etc.) match the exact production run — this defeats the card #590
// D3 artifact where a local env made coverageComplete veto pre-empt the real verifierSound gate. Dynamic import AFTER.
const flagEnv = rec.meta?.flagEnv ?? {};
for (const [k, v] of Object.entries(flagEnv)) process.env[k] = String(v);
type F = any;
(async () => {
const { deriveVerdict } = await import("../../src/lib/audit-decide");
const inp: any = JSON.parse(JSON.stringify(rec.result.inputs)); // deep clone; never touch the record

// Neutralize one finding the way a curable-typing / dormancy demote would: no longer an active bar.
const neutralize = (f: F) => { f.controllability = "bidder_controls"; f.curableInWindow = true; f.requiredAttribute = undefined; f.kind = "other"; f.universalDefect = undefined; f.cautionFloor = true; f.nmrGuard = undefined; };
const short = (f: F) => `[${f.kind}|${f.controllability}|cur=${f.curableInWindow}|reqAttr=${f.requiredAttribute ?? "-"}] ${(f.citation || "?")} :: ${(f.requirement || "").slice(0, 90)}`;

const gates: string[] = [];
let prevReason = "";
for (let step = 0; step < 20; step++) {
  const d: any = deriveVerdict(inp);
  const ss: F[] = d.showStoppers ?? [];
  console.log(`\n── STEP ${step} ──  verdict=${d.verdict}  eligible=${d.eligible}`);
  console.log(`   reason: ${(d.reason || "").slice(0, 200)}`);
  if (ss.length) { console.log(`   showStoppers (${ss.length}):`); ss.slice(0, 6).forEach((f) => console.log(`     - ${short(f)}`)); }

  if (d.verdict === "BID" || d.verdict === "BID_WITH_CAUTION") { gates.push(`✅ REACHED ${d.verdict} at step ${step}`); break; }

  // Record the gate (dedup consecutive identical reasons).
  const gateName = (d.reason || "").split("—")[0].split("(")[0].trim().slice(0, 110);
  if (gateName !== prevReason) { gates.push(`GATE ${gates.length + 1}: ${d.verdict} · ${gateName}`); prevReason = gateName; }

  // Satisfy the gate in simulation.
  let advanced = false;
  if (inp.verifierSound === false) { inp.verifierSound = true; advanced = true; console.log("   → sim: verifierSound:=true"); }
  else if (ss.length) {
    // neutralize the blocking findings in the REAL inp.findings by identity (id or citation+requirement).
    for (const s of ss) {
      const t = (inp.findings as F[]).find((f) => (s.id && f.id === s.id) || (f.citation === s.citation && f.requirement === s.requirement));
      if (t) { neutralize(t); advanced = true; }
    }
    console.log(`   → sim: neutralized ${ss.length} show-stopper(s)`);
  } else {
    // No show-stoppers surfaced but still not committal — an NHR driven by a non-show-stopper input
    // (coverage / verified-floor / untyped-bar-in-dispositions). Try neutralizing untyped/non-curable bars in dispositions.
    const untyped = (inp.findings as F[]).filter((f) => f.kind === "eligibility_bar" && (f.requiredAttribute === undefined || f.curableInWindow === undefined || f.curableInWindow === false) && f.controllability !== "bidder_controls");
    if (untyped.length) { untyped.forEach(neutralize); advanced = true; console.log(`   → sim: neutralized ${untyped.length} untyped/non-curable eligibility_bar(s) from dispositions`); }
  }
  if (!advanced) { gates.push(`⛔ CANNOT-SIMULATE at step ${step}: ${d.verdict} · ${(d.reason || "").slice(0, 160)}`); break; }
}

console.log("\n\n======== ORDERED GATE PATH TO A COMMITTAL RENDER ========");
gates.forEach((g) => console.log("  " + g));
console.log(`\nTotal distinct gates encountered: ${gates.filter((g) => g.startsWith("GATE")).length}`);
})();
