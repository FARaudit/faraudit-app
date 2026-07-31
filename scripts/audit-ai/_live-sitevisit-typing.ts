// The emitter applies ONE controllability to ALL four branches. Branch 2 fires when a site visit is stated
// but NOT concluded — i.e. still attendable. A bidder can simply attend it. Is it nonetheless typed as a bar
// the bidder cannot move? And does the corpus contain that branch?
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const BRANCH: Array<[RegExp, string]> = [
    [/site visit stated in the SAM notice body was held\/concluded/, "1 CONCLUDED (verified correct to mute)"],
    [/site visit \/ pre-proposal conference stated in the SAM notice body — attendance gates/, "2 LIVE — still attendable"],
    [/Security\/facility clearance stated as an eligibility bar/, "3 CLEARANCE"],
    [/^Eligibility bar stated in the SAM notice body/, "4 GENERIC"],
    [/Order restricted to vehicle HOLDERS ONLY/, "5 BOA HOLDER-ONLY"],
  ];
  const tally = new Map<string, number>(); const typing = new Map<string, Set<string>>();
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    for (const f of inp.findings ?? []) {
      const hit = BRANCH.find(([re]) => re.test(String(f.requirement ?? "")));
      if (!hit) continue;
      tally.set(hit[1], (tally.get(hit[1]) ?? 0) + 1);
      if (!typing.has(hit[1])) typing.set(hit[1], new Set());
      typing.get(hit[1])!.add(`controllability=${f.controllability} curable=${f.curableInWindow} attr=${f.requiredAttribute ?? "(none)"}`);
    }
  }
  console.log("NOTICE-BAR EMITTER — branches present in the banked corpus:");
  for (const [, name] of BRANCH) {
    const n = tally.get(name) ?? 0;
    console.log(`   ${String(n).padStart(3)}  ${name}`);
    for (const t of typing.get(name) ?? []) console.log(`        ${t}`);
  }
})();
