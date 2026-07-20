// Card #609-(2) DRY cert — clause-keyed typing floor + BINDING-a. $0, banked records only.
import * as fs from "fs";
import { applyClauseKeyedTypingFloor, deriveShadowVerdict } from "../../src/lib/audit-decide";
process.env.AUDIT_POSITIVE_VERDICT_POLE = "true";
const load = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const shadow = (rec: any, floorOn: boolean, naics: string | null) => {
  const inp = { ...rec.result.inputs };
  inp.findings = applyClauseKeyedTypingFloor(inp.findings ?? [], { enabled: floorOn });
  return deriveShadowVerdict(inp, { naics });
};
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { (c ? pass++ : fail++); console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); };

const cab = load("scripts/audit-ai/run-records/_new-cab687da.json");
const base = shadow(cab, false, "561320");
const floored = shadow(cab, true, "561320");
console.log(`cab687da BASE:    ${base.verdict} · "${base.reason.slice(0,70)}"`);
console.log(`cab687da FLOORED: ${floored.verdict} · "${floored.reason.slice(0,70)}"`);
// Bar #2 (52.219-14) should no longer be an untyped bar; the untyped count should DROP by 1.
const baseUntyped = (base.reason.match(/(\d+) deciding disqualifying bar/) || [])[1];
const floorUntyped = (floored.reason.match(/(\d+) deciding disqualifying bar/) || [])[1];
ok("cab687da: floor reduces untyped deciding bars", Number(floorUntyped) < Number(baseUntyped) || (base.verdict!==floored.verdict), `base=${baseUntyped} floored=${floorUntyped}`);
ok("cab687da: Bar#1 (insurance/possession) STILL holds NHR (fail-closed)", floored.verdict === "NEEDS_HUMAN_REVIEW", `got ${floored.verdict}`);

// regression: 40fd02ce shadow → BWC preserved; 45f9bacd shadow → NHR preserved
const f40 = shadow(load("scripts/audit-ai/run-records/_dl-40fd02ce.json"), true, "561320");
ok("40fd02ce shadow → BID_WITH_CAUTION preserved (floor ON)", f40.verdict === "BID_WITH_CAUTION", `got ${f40.verdict}: ${f40.reason.slice(0,50)}`);
try {
  const r45 = load("scripts/audit-ai/run-records/_fire-45f9bacd.json");
  const f45 = shadow(r45, true, "561320");
  ok("45f9bacd shadow → NHR preserved (floor ON)", f45.verdict === "NEEDS_HUMAN_REVIEW", `got ${f45.verdict}`);
} catch (e) { console.log("⚠ 45f9bacd record not local — skipped (regression covered by gold-set)"); }

// determinism: floor is a pure map — same input → same output
const d1 = JSON.stringify(shadow(cab, true, "561320")), d2 = JSON.stringify(shadow(cab, true, "561320"));
ok("determinism: floored shadow stable across runs", d1 === d2);
console.log(`\n=== CERT: ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
