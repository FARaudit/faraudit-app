export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
process.env.AUDIT_TEMPORAL_VERDICT = "true";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const r = led.find((x) => x.id.includes("999e909b"))!;
  const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
  const d: any = deriveVerdict(inp);
  console.log("VERDICT:", d.verdict);
  console.log("REASON:\n", d.reason);
  console.log("\nCAVEATS:", JSON.stringify(d.caveats ?? d.cautions ?? null, null, 1)?.slice(0, 1500));
  console.log("\nnames 8(a)?", /8\s?\(?a\)?/i.test(JSON.stringify(d)));
  console.log("names 52.219-18?", /52\.219-18/.test(JSON.stringify(d)));
  console.log("names SBA?", /\bSBA\b/.test(JSON.stringify(d)));
})();
