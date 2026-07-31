// WHICH of the eight "eligibility" exits in deriveVerdict is the corpus actually taking? noVerdictCause
// is the same string at all eight, so discriminate on the reason-line signature each site emits.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
const SIG: Array<[RegExp, string]> = [
  [/^Human review required to confirm eligibility — the solicitation notice states bar/, "3631 notice-body bars (named)"],
  [/^A bidder-eligibility bar stated in the solicitation notice/,                        "3631 notice-body bars (generic B3)"],
  [/^Set-aside conflict/,                                                                "3658 set-aside SAM-vs-doc conflict"],
  [/^CONDITIONAL bar\(s\) on an INCOMPLETE read/,                                        "3740 conditional bars, incomplete read"],
  [/missing required typing/,                                                            "3847 untyped disqualifying bar"],
  [/^Manufacturer\/nonmanufacturer status not determined/,                               "3882 NMR status unknown"],
];
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const tally = new Map<string, number>(); const stoppers = new Map<string, number>();
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let d: any; try { d = deriveVerdict(inp); } catch { continue; }
    if (d.noVerdictCause !== "eligibility") continue;
    const hit = SIG.find(([re]) => re.test(String(d.reason)));
    const k = hit ? hit[1] : `UNMATCHED: ${String(d.reason).slice(0, 60)}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
    for (const s of d.showStoppers ?? []) {
      const req = String(s.requirement ?? "").slice(0, 72);
      stoppers.set(req, (stoppers.get(req) ?? 0) + 1);
    }
  }
  console.log("ELIGIBILITY MUTE — which exit fires:");
  for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${k}`);
  console.log("\nthe bars being cited (top 12):");
  for (const [k, n] of [...stoppers].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${String(n).padStart(3)}×  ${k}`);
})();
