// $0 gate — construction OUT_OF_SCOPE detector (Brain card-64 Part D).
// LOAD-BEARING NEGATIVE + POSITIVE REPLAY over the gold sources:
//   POSITIVE: #5 FA667024R0001 (construction) MUST fire OUT_OF_SCOPE.
//   NEGATIVE (load-bearing): in-scope supply/repair/services sols MUST NOT trip — if ANY does, FAIL
//     the build and do NOT tune-to-pass (revert + card back, per Brain).
//   #4 AOCSSB26R0023 reported: NAICS 541990 (professional services) — expected NOT to fire (the finding).
//   npx tsx scripts/audit-ai/test-construction-detector.ts
import { readFileSync, existsSync } from "node:fs";
import { detectConstructionOutOfScope } from "@/lib/section-boundary-detector";

const G = "scripts/audit-ai/gold-sets";

function sourceFor(sol: string): string {
  const complete = `${G}/${sol}-FULL-SOURCE.complete.txt`;
  const plain = `${G}/${sol}-FULL-SOURCE.txt`;
  return readFileSync(existsSync(complete) ? complete : plain, "utf8");
}
// Extract the labeled primary NAICS when present (best-effort; SF-1442 / boundary carry detection
// regardless, so a missed NAICS never produces a false negative on a real construction package).
function naicsOf(text: string): string | null {
  const m = text.match(/NAICS[^0-9]{0,40}(\d{6})/i);
  return m ? m[1] : null;
}

interface Case { sol: string; expectFire: boolean; loadBearing: boolean; role: string; }
const CASES: Case[] = [
  { sol: "FA667024R0001", expectFire: true,  loadBearing: false, role: "#5 construction (positive — MUST fire)" },
  { sol: "N4008526R0065", expectFire: false, loadBearing: true,  role: "#1 Norfolk ship-repair (in-scope CAUTION — MUST NOT trip)" },
  { sol: "1240LP26Q0067", expectFire: false, loadBearing: true,  role: "#2 supply (in-scope BID — MUST NOT trip)" },
  { sol: "SPRDL125Q0030", expectFire: false, loadBearing: true,  role: "#3 supply (in-scope INELIGIBLE — MUST NOT trip)" },
  { sol: "AOCSSB26R0023", expectFire: false, loadBearing: false, role: "#4 AOC plaster conservation (NAICS 541990 services — finding: NOT construction)" },
];

let fail = false;
console.log("── construction OUT_OF_SCOPE detector — replay ──\n");
for (const c of CASES) {
  const text = sourceFor(c.sol);
  const naicsCode = naicsOf(text);
  const det = detectConstructionOutOfScope({ naicsCode, fullText: text });
  const fired = det !== null;
  const ok = fired === c.expectFire;
  const tag = ok ? "PASS" : (c.loadBearing ? "FAIL (LOAD-BEARING NEGATIVE TRIPPED)" : "FAIL");
  if (!ok) fail = true;
  const detail = fired ? `OUT_OF_SCOPE [${det!.tier}] ${det!.matchedSignals.join(" · ")}` : `in-scope (no construction signal); naics=${naicsCode ?? "n/a"}`;
  console.log(`  [${tag}] ${c.sol} — ${c.role}\n         → ${detail}\n`);
}

if (fail) {
  console.error("✗ DETECTOR REPLAY FAILED — do NOT tune-to-pass; revert + card back (Brain Part D).");
  process.exit(1);
}
console.log("✓ all replay cases pass: #5 fires construction; in-scope sols do not trip; #4 confirmed NOT construction-by-criteria.");
