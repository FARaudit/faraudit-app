// GAUNTLET integration (card #582) — replayCoverageStage on a REAL banked LBJ record proves (1) FAITHFUL reproduction of
// the recorded coverageV2 when the run's flags are restored, and (2) per-flag ISOLATION: toggling one coverage-grader
// flag (AUDIT_AMBIGUOUS_SIGNAL_DEMOTION) moves the exact bucket it governs — mining a class-B flag on banked data at $0.
import { readFileSync } from "fs";
import { replayCoverageStage, type RunRecord } from "../../src/lib/audit-run-record";

const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/_lbj-armed/33c9187e-21fe-4f1a-aea0-f15c2bfb85b9.json", "utf8")) as RunRecord;
const recorded = (rec.result.inputs as { coverageV2?: { disqualifierUncovered?: unknown[]; ungroundedNonBarSignal?: unknown[] } }).coverageV2;
console.log(`record ${rec.meta.sol} · attestations=${rec.result.coverage.attestations.length} · recorded coverageV2: disqUncovered=${recorded?.disqualifierUncovered?.length} nonBarSignal=${recorded?.ungroundedNonBarSignal?.length}`);

const run = (label: string, on: boolean) => {
  const saved = process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION;
  process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = on ? "true" : "";
  const r = replayCoverageStage(rec);
  if (saved === undefined) delete process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION; else process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = saved;
  console.log(`  AMBIGUOUS_SIGNAL_DEMOTION=${on ? "ON " : "OFF"}  disqUncovered=${r.disqualifierUncovered}  nonBarSignal=${r.ungroundedNonBarSignal}`);
  return r;
};

let fail = 0;
console.log("\nper-flag isolation on a REAL banked run:");
const on = run("on", true);
const off = run("off", false);
const faithful = on.disqualifierUncovered === (recorded?.disqualifierUncovered?.length ?? -1) && on.ungroundedNonBarSignal === (recorded?.ungroundedNonBarSignal?.length ?? -1);
const isolates = off.ungroundedNonBarSignal === 0 && off.disqualifierUncovered > on.disqualifierUncovered;
console.log(`\n${faithful ? "✅" : "❌"} FAITHFUL: flags-restored replay reproduces the recorded coverageV2 buckets exactly`); if (!faithful) fail++;
console.log(`${isolates ? "✅" : "❌"} ISOLATES: toggling the flag moves ONLY its bucket (nonBarSignal ${on.ungroundedNonBarSignal}→${off.ungroundedNonBarSignal}, those rows revert to disqualifierUncovered) — per-flag delta on banked data`); if (!isolates) fail++;
console.log(`\n${fail === 0 ? "✅ ALL PASS — coverage-stage per-flag mining works on banked runs (the #578/#580 blocker is lifted for coverage-grader flags)" : `❌ ${fail} FAIL`}`);
process.exit(fail === 0 ? 0 : 1);
