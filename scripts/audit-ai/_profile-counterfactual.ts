// THE COUNTERFACTUAL ($0, no model): is the 79% decline rate a VERDICT-LOGIC problem, or a MISSING-PROFILE
// problem? Census the requiredAttribute tokens the declines turn on, then re-derive with a profile that
// holds them. If the declines persist, the logic is the bottleneck. If they flip, the profile is.
export {};
import { applyStampedConfig, rebuildLedger, isCommittal } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const prep = (r: any, profile: any) => {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    return profile === undefined ? inp : { ...inp, bidderProfile: profile };
  };
  // 1 — what does the CURRENT profile actually hold, and what do the findings ASK for?
  const holds = new Map<string, number>(), asks = new Map<string, number>();
  for (const r of m) {
    for (const a of r.inputs.bidderProfile?.satisfiedAttributes ?? []) holds.set(a, (holds.get(a) ?? 0) + 1);
    for (const f of r.inputs.findings ?? []) if (f.requiredAttribute) asks.set(f.requiredAttribute, (asks.get(f.requiredAttribute) ?? 0) + 1);
  }
  console.log("PROFILE HOLDS (across all banked runs):");
  for (const [a, n] of [...holds].sort((x, y) => y[1] - x[1])) console.log(`   ${String(n).padStart(3)} runs  ${a}`);
  console.log(`\nFINDINGS ASK FOR ${asks.size} distinct attributes:`);
  for (const [a, n] of [...asks].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`   ${String(n).padStart(3)}×  ${a}${holds.has(a) ? "   ← held" : ""}`);
  const unmet = [...asks.keys()].filter((a) => !holds.has(a));
  console.log(`\n   held: ${[...asks.keys()].filter((a) => holds.has(a)).length} · NOT held: ${unmet.length}`);

  // 2 — the counterfactual: a profile holding EVERY attribute the corpus asks for, open-world (no closedWorld
  //     opt-in, so this can only CLEAR bars, never manufacture a false INELIGIBLE).
  const rich = { satisfiedAttributes: [...new Set([...holds.keys(), ...asks.keys()])], openWorld: true };
  let base = { commit: 0, n: 0 }, rich2 = { commit: 0, n: 0 };
  const flips: string[] = [];
  for (const r of m) {
    let a = "THREW", b = "THREW";
    try { a = String(deriveVerdict(prep(r, undefined)).verdict); } catch {}
    try { b = String(deriveVerdict(prep(r, rich)).verdict); } catch {}
    base.n++; rich2.n++; if (isCommittal(a)) base.commit++; if (isCommittal(b)) rich2.commit++;
    if (a !== b) flips.push(`   ${r.id.slice(0, 46).padEnd(46)} ${a} → ${b}`);
  }
  console.log(`\nCOUNTERFACTUAL — same findings, same flags, richer profile:`);
  console.log(`   as banked : ${base.commit}/${base.n} commit (${(100 * base.commit / base.n).toFixed(1)}%)`);
  console.log(`   enriched  : ${rich2.commit}/${rich2.n} commit (${(100 * rich2.commit / rich2.n).toFixed(1)}%)`);
  console.log(`   verdicts changed: ${flips.length}`);
  for (const f of flips) console.log(f);
})();
