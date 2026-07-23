export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
process.env.AUDIT_TEMPORAL_VERDICT = "true";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const r = led.find((x) => x.id.includes("bf388766"))!;
  const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
  const d: any = deriveVerdict(inp);
  console.log("verdict:", d.verdict);
  console.log("reason:", d.reason);
  console.log("\nHARD BARS:");
  for (const b of (inp.findings as any[]).filter(f=>f.controllability==="bidder_cannot_move"||f.controllability==="no_one_can_move"))
    console.log(`  ctrl=${b.controllability} kind=${b.kind} attr=${b.requiredAttribute??"-"}\n    req=${JSON.stringify((b.requirement||"").slice(0,150))}\n    exc=${JSON.stringify((b.excerpt||"").slice(0,180))}`);
  console.log("\nsamSetAside:", JSON.stringify(inp.samSetAside));
})();
