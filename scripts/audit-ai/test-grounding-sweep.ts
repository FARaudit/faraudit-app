// Brain card 81 Step 1 ($0) — REPLAY the deterministic grounding sweep over STORED gold sources. NO paid run.
//   npx tsx scripts/audit-ai/test-grounding-sweep.ts
import { readFileSync } from "node:fs";
import { highSignalSweep } from "../../src/lib/audit-grounding-sweep";
import { applyCautionFloor, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };
const GOLD = "scripts/audit-ai/gold-sets";
const src = (f: string) => readFileSync(`${GOLD}/${f}`, "utf8");
const archetypes = (fs: TypedFinding[]) => fs.map((f) => f.sweepArchetype).sort();

// ── #4 AOCSSB26R0023 — must ground the conservator quals (personnel_qual) the lenses missed ──
const s4 = src("AOCSSB26R0023-FULL-SOURCE.complete.txt");
const sw4 = highSignalSweep(s4);
console.log("[#4 AOCSSB26R0023] sweep archetypes:", archetypes(sw4));
const pq4 = sw4.filter((f) => f.sweepArchetype === "personnel_qual");
ok(pq4.length > 0, `grounds personnel_qual (conservator quals) — ${pq4.length} (lenses grounded 0/23)`);
ok(pq4.some((f) => /twenty|\b20\b|ten|\b10\b/i.test(f.excerpt) && /conservator/i.test(f.excerpt)), "personnel_qual excerpt contains the ≥20yr/≥10yr conservator text");
ok(sw4.every((f) => s4.includes(f.excerpt)), "every #4 sweep excerpt is VERBATIM-present in source");

// ── NO_BID v2 canonical — must ground FAT precondition + delivery window, NOT the demoted conclusion ──
const sN = src("FA860126Q00260001-FULL-SOURCE.complete.txt");
const swN = highSignalSweep(sN);
console.log("[NO_BID FA860126Q00260001] sweep archetypes:", archetypes(swN));
ok(swN.some((f) => f.sweepArchetype === "fat_precondition"), "grounds fat_precondition (F.1, lenses grounded 0/36)");
ok(swN.some((f) => f.sweepArchetype === "delivery_window"), "grounds delivery_window (F.2)");
ok(swN.some((f) => f.sweepArchetype === "fat_precondition" && /SIXTY \(60\)|60/.test(f.excerpt)), "FAT excerpt carries the 60-day duration (for Step-2 temporal check)");
ok(swN.some((f) => f.sweepArchetype === "delivery_window" && /THIRTY \(30\)|30/.test(f.excerpt)), "delivery excerpt carries the 30-day ARO duration");
ok(swN.every((f) => sN.includes(f.excerpt)), "every NO_BID sweep excerpt is VERBATIM-present in source");
ok(!swN.some((f) => /universally unmeetable|net-?effect/i.test(f.excerpt)), "PROVENANCE-SAFE: NO swept finding contains the demoted conclusion (banner skipped, card 76-R1)");

// ── #2 1240LP26Q0067 — regression: sweep must not ground a personnel_qual/FAT that would mis-flip it ──
const s2 = src("1240LP26Q0067-FULL-SOURCE.txt");
const sw2 = highSignalSweep(s2);
console.log("[#2 1240LP26Q0067] sweep archetypes:", archetypes(sw2));
ok(!sw2.some((f) => f.sweepArchetype === "personnel_qual"), "no spurious personnel_qual on #2");
ok(sw2.every((f) => s2.includes(f.excerpt)), "every #2 sweep excerpt is verbatim (if any)");

// ── INTEGRATION ($0): #4 stored lens findings + sweep findings + caution-floor ON → BID_WITH_CAUTION ──
const f4lens = (JSON.parse(readFileSync(`ceo/proofs/v3-AOCSSB26R0023-result.json`, "utf8")).findings as TypedFinding[]).map((f) => ({ ...f, grounded: true }));
const decide = (findings: TypedFinding[], floorOn: boolean) => {
  const ff = applyCautionFloor(findings, { enabled: floorOn });
  const inp: VerdictInputs = { findings: ff, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true };
  return deriveVerdict(inp).verdict;
};
console.log("[#4 integration: lens findings + sweep + caution-floor]");
ok(decide(f4lens, true) === "BID", "baseline (no sweep, floor ON) → BID (the stored-findings gap)");
ok(decide([...f4lens, ...sw4], true) === "BID_WITH_CAUTION", `sweep grounds the quals + caution-floor → ${decide([...f4lens, ...sw4], true)} (#4 FLIPS to CAUTION)`);
ok(decide([...f4lens, ...sw4], false) === "BID", "flag OFF (no floor) → BID (unchanged; sweep alone never forces caution)");

console.log("");
if (fail) { console.error(`✗ ${fail} check(s) FAILED`); process.exit(1); }
console.log("✓ STEP 1 GREEN — sweep grounds the failing archetypes (conservator quals #4, FAT+delivery NO_BID) with verbatim excerpts, is provenance-safe (no demoted conclusion), no #2 regression, and #4 flips to BID_WITH_CAUTION once grounded + floored. NO_BID flip awaits Step 2 (temporal-conflict check). $0.");
