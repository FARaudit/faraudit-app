// $0 self-test for the oracle scoring harness. Proves the scorer enforces Brain's done-gate: a committal-direction
// contradiction of adjudicated truth = BLOCKER; a correct/conservative verdict = PASS; a snapshot-invisible miss =
// WATCH (soft); and GREEN needs >=2-3 FULL-DOC ran. Synthetic verdicts — no engine, $0.
import { loadOracleManifest, runOracle, scoreOracleCase, type OracleCase, type EngineRun } from "./oracle-harness";
import type { Verdict } from "../../../src/lib/audit-decide";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

const m = loadOracleManifest();
const byId = (id: string) => m.cases.find((c) => c.id === id) as OracleCase;

// ── Per-case scoring ──
// Underdogs truth=INELIGIBLE: declaring the firm biddable = false-eligible contradiction → BLOCKER.
ok("underdogs BID → BLOCKER", scoreOracleCase(byId("SBA-SIZ-6373-underdogs"), "BID").status, "BLOCKER");
ok("underdogs INELIGIBLE → PASS", scoreOracleCase(byId("SBA-SIZ-6373-underdogs"), "INELIGIBLE").status, "PASS");
ok("underdogs NHR → PASS (conservative)", scoreOracleCase(byId("SBA-SIZ-6373-underdogs"), "NEEDS_HUMAN_REVIEW").status, "PASS");
// UNCOMN truth=SMALL/eligible: declaring INELIGIBLE = contradiction → BLOCKER.
ok("uncomn INELIGIBLE → BLOCKER", scoreOracleCase(byId("SBA-SIZ-6379-uncomn"), "INELIGIBLE").status, "BLOCKER");
ok("uncomn BID → PASS", scoreOracleCase(byId("SBA-SIZ-6379-uncomn"), "BID").status, "PASS");
// FCN truth=term proper: flagging NO_BID on proper terms = false-defect contradiction → BLOCKER.
ok("fcn NO_BID → BLOCKER", scoreOracleCase(byId("GAO-B-424249-fcn-negative"), "NO_BID").status, "BLOCKER");
ok("fcn BID → PASS", scoreOracleCase(byId("GAO-B-424249-fcn-negative"), "BID").status, "PASS");
// ECS truth=defective (process caveat): NO_BID = BLOCKER; clean BID = WATCH (soft); CAUTION = PASS.
ok("ecs NO_BID → BLOCKER", scoreOracleCase(byId("GAO-B-423993-ecs-caution"), "NO_BID").status, "BLOCKER");
ok("ecs BID → WATCH (process-caveat soft miss)", scoreOracleCase(byId("GAO-B-423993-ecs-caution"), "BID").status, "WATCH");
ok("ecs BID_WITH_CAUTION → PASS", scoreOracleCase(byId("GAO-B-423993-ecs-caution"), "BID_WITH_CAUTION").status, "PASS");
// Nisou negative: INELIGIBLE from silence = the over-assertion OHA vacated → BLOCKER.
ok("nisou INELIGIBLE → BLOCKER", scoreOracleCase(byId("SBA-SIZ-6380-nisou-negative"), "INELIGIBLE").status, "BLOCKER");

async function main() {
  // ── Aggregate: an ALL-CORRECT run (with 3 FULL-DOC) is GREEN; one committal error kills it. ──
  const perfect: Record<string, Verdict> = {
    "SBA-SIZ-6373-underdogs": "INELIGIBLE", "SBA-SIZ-6379-uncomn": "BID", "SBA-SIZ-6381-sgi-global": "BID",
    "SBA-SIZ-6380-nisou-negative": "NEEDS_HUMAN_REVIEW", "GAO-B-424249-fcn-negative": "BID", "GAO-B-423993-ecs-caution": "BID_WITH_CAUTION",
  };
  const perfectEngine: EngineRun = (c) => perfect[c.id];
  const good = await runOracle(m, perfectEngine, { useFullDoc: true });
  ok("perfect run → zero blockers", good.summary.blockers.length, 0);
  ok("perfect run → 3 FULL-DOC ran", good.summary.fullDocRan, 3);
  ok("perfect run → GREEN-eligible (0 blockers + >=2 fulldoc)", good.summary.greenEligible, true);
  ok("perfect run → smoke pass", good.summary.pass, true);

  const brokenEngine: EngineRun = (c) => (c.id === "SBA-SIZ-6379-uncomn" ? "INELIGIBLE" : perfect[c.id]);
  const bad = await runOracle(m, brokenEngine, { useFullDoc: true });
  ok("one false-INELIGIBLE → 1 blocker", bad.summary.blockers.length, 1);
  ok("one false-INELIGIBLE → NOT green", bad.summary.greenEligible, false);
  ok("one false-INELIGIBLE → smoke FAIL", bad.summary.pass, false);

  // ── GREEN requires FULL-DOC: a zero-blocker run with NO full-doc is a pass but NOT green-eligible (Brain R5). ──
  const termOnly = await runOracle(m, perfectEngine, { useFullDoc: false });
  ok("term-only clean run → smoke pass", termOnly.summary.pass, true);
  ok("term-only clean run → NOT green (0 fulldoc ran)", termOnly.summary.greenEligible, false);
  ok("calibration cases excluded from the gate", good.summary.total, 6);
}

main().then(() => {
  console.log("\noracle harness self-test");
  for (const f of fails) console.log(`  ✗  ${f}`);
  console.log(fails.length === 0 ? `\n✅ ALL GREEN — ${pass} passed, 0 failed` : `\n❌ ${fails.length} FAILED — ${pass} passed`);
  if (fails.length) process.exit(1);
});
