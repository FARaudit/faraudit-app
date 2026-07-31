// THE HYPOTHESIS: the notice-body bar path emits show-stoppers with NO requiredAttribute, so firmStatus
// never runs on them and NO profile — however complete — can clear them. If true, the eligibility mute is
// structurally profile-unreachable, and that is why a fully-provenanced profile moved 15 -> 14.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  let withAttr = 0, without = 0; const examples: string[] = [];
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let d: any; try { d = deriveVerdict(inp); } catch { continue; }
    if (d.noVerdictCause !== "eligibility") continue;
    for (const s of d.showStoppers ?? []) {
      if (s.requiredAttribute) { withAttr++; if (examples.length < 6) examples.push(`   HAS attr  ${s.requiredAttribute}  ← ${String(s.requirement).slice(0, 58)}`); }
      else { without++; if (examples.length < 6) examples.push(`   NO attr   —  ${String(s.requirement).slice(0, 66)}`); }
    }
  }
  console.log(`show-stoppers cited by the eligibility mute: ${withAttr + without}`);
  console.log(`   WITH requiredAttribute (profile can reach) : ${withAttr}`);
  console.log(`   WITHOUT                (profile cannot)    : ${without}`);
  for (const e of examples) console.log(e);
})();
