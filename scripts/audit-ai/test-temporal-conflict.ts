// Brain card 81 Step 2 ($0) — temporal-conflict show-stopper over STORED gold sources. NO paid run.
//   npx tsx scripts/audit-ai/test-temporal-conflict.ts
import { readFileSync } from "node:fs";
import { highSignalSweep } from "../../src/lib/audit-grounding-sweep";
import { applyCautionFloor, applyTemporalConflict, deriveVerdict, parseDays } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };
const GOLD = "scripts/audit-ai/gold-sets";
const src = (f: string) => readFileSync(`${GOLD}/${f}`, "utf8");
const lens = (sol: string) => (JSON.parse(readFileSync(`ceo/proofs/v3-${sol}-result.json`, "utf8")).findings as TypedFinding[]).map((f) => ({ ...f, grounded: true }));

// full Step1+Step2 pipeline ($0): lens findings + sweep + temporal-conflict + caution-floor → derived verdict
const decide = (lensF: TypedFinding[], source: string, opts: { sweep: boolean; temporal: boolean; floor: boolean }) => {
  let f = [...lensF];
  if (opts.sweep) f = [...f, ...highSignalSweep(source)];
  if (opts.temporal) f = applyTemporalConflict(f, { enabled: true });
  f = applyCautionFloor(f, { enabled: opts.floor });
  const inp: VerdictInputs = { findings: f, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true };
  return deriveVerdict(inp).verdict;
};

// ── parseDays unit ──
console.log("[parseDays]");
ok(parseDays("SIXTY (60) calendar days") === 60, `"SIXTY (60) calendar days" → ${parseDays("SIXTY (60) calendar days")}`);
ok(parseDays("NOT LATER THAN THIRTY (30) calendar days After Receipt of Order") === 30, `"THIRTY (30)..." → ${parseDays("NOT LATER THAN THIRTY (30) calendar days After Receipt of Order")}`);
ok(parseDays("within 30 days, or 90 days max") === 30, "smallest binding minimum picked (30 from 30/90)");
ok(parseDays("no day count here") === null, "no duration → null");

// ── NO_BID — the flip ──
const sN = src("FA860126Q00260001-FULL-SOURCE.complete.txt");
const lN = lens("FA860126Q00260001");
console.log("\n[NO_BID FA860126Q00260001]");
ok(decide(lN, sN, { sweep: true, temporal: false, floor: true }) !== "NO_BID", `sweep only (no temporal) → ${decide(lN, sN, { sweep: true, temporal: false, floor: true })} (not yet NO_BID — Step 2 needed)`);
ok(decide(lN, sN, { sweep: true, temporal: true, floor: true }) === "NO_BID", `sweep + temporal-conflict → ${decide(lN, sN, { sweep: true, temporal: true, floor: true })} (NO_BID — THE FLIP)`);
ok(decide(lN, sN, { sweep: false, temporal: true, floor: true }) !== "NO_BID", "temporal without sweep (no grounded FAT/delivery) → no flip (depends on Step 1)");

// ── #4 — regression: temporal-conflict must NOT affect it (no FAT precondition) → stays CAUTION ──
const s4 = src("AOCSSB26R0023-FULL-SOURCE.complete.txt");
const l4 = lens("AOCSSB26R0023");
console.log("\n[#4 AOCSSB26R0023 — regression]");
ok(decide(l4, s4, { sweep: true, temporal: true, floor: true }) === "BID_WITH_CAUTION", `sweep + temporal + floor → ${decide(l4, s4, { sweep: true, temporal: true, floor: true })} (unaffected by Step 2; stays CAUTION)`);

// ── #2 — regression: stays BID ──
const s2 = src("1240LP26Q0067-FULL-SOURCE.txt");
const l2 = lens("1240LP26Q0067");
console.log("\n[#2 1240LP26Q0067 — regression]");
ok(decide(l2, s2, { sweep: true, temporal: true, floor: true }) === "BID", `sweep + temporal + floor → ${decide(l2, s2, { sweep: true, temporal: true, floor: true })} (stays BID)`);

// ── safety: non-waivable + duration-math guards ──
console.log("\n[safety guards]");
const mkFat = (excerpt: string): TypedFinding => ({ requirement: "FAT", citation: "§F", excerpt, kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "deterministic_sweep", sweepArchetype: "fat_precondition" });
const mkDel = (excerpt: string): TypedFinding => ({ requirement: "delivery", citation: "§F", excerpt, kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "deterministic_sweep", sweepArchetype: "delivery_window" });
const fires = (fat: string, del: string) => applyTemporalConflict([mkFat(fat), mkDel(del)], { enabled: true }).some((f) => f.controllability === "no_one_can_move");
ok(fires("NON-WAIVABLE first article testing SIXTY (60) calendar days before delivery", "deliver within THIRTY (30) calendar days ARO"), "non-waivable 60 > 30 → fires");
ok(!fires("first article testing of SIXTY (60) calendar days; the CO may waive at its discretion", "deliver within THIRTY (30) days ARO"), "WAIVABLE 60 vs 30 → does NOT fire (CO can waive → not universal)");
ok(!fires("NON-WAIVABLE first article testing of TWENTY (20) calendar days", "deliver within THIRTY (30) days ARO"), "non-waivable 20 ≤ 30 → does NOT fire (fits in window)");

console.log("");
if (fail) { console.error(`✗ ${fail} check(s) FAILED`); process.exit(1); }
console.log("✓ STEP 2 GREEN — temporal-conflict emits no_one_can_move ⇒ NO_BID flips (sweep+temporal); #4 stays CAUTION, #2 stays BID; non-waivable + duration-math guards hold. $0.");
