// Bound the 8(a) belt-evasion break: (a) how realistic is the thing-lead 8(a) restriction without a set-aside token,
// (b) does the SAME gap exist for other socioeconomic programs, (c) does adding 'set-aside' rescue it (belt2).
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

const BENIGN = "Government-furnished property will be provided at the contractor's facility during performance.";
const mkFinding = (sec: string, ex: string): TypedFinding =>
  ({ id: "f_b", citation: `§${sec}`, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);
const run = (bar: string) => {
  const src = ["SECTION C - DESCRIPTION", BENIGN, bar].join("\n");
  const r = completenessOf({ fullSource: src } as any, ["C"], [mkFinding("C", BENIGN)], new Set(["C"]));
  return r.attestations.find((x) => x.section === "C")?.status === "obligations_ungrounded" ? "FLOOR" : "SKIP ";
};

const CASES: Array<[string, string]> = [
  // Realistic §C restriction prose that leads with a thing-noun. These are the ones that MATTER.
  ["8a no set-aside token", "Provisions of this notice restrict award to 8(a) program participants only."],
  ["8a 'entities' noun", "Items under this action are available for award only to 8(a) certified entities."],
  ["8a with set-aside token (belt2 rescue?)", "Provisions of this notice restrict this 8(a) set-aside to eligible 8(a) participants."],
  // Other programs — these tokens ARE in FIRM_CREDENTIAL_RE, so belt2 SHOULD rescue them:
  ["hubzone thing-lead", "Provisions of this notice restrict award to HUBZone participants only."],
  ["sdvosb thing-lead", "Provisions of this notice restrict award to service-disabled veteran-owned participants."],
  ["wosb thing-lead", "Provisions of this notice restrict award to WOSB participants only."],
  // 8(a) with an offeror/firm noun that IS covered — belt1 rescue:
  ["8a with 'concerns'", "Provisions of this notice restrict award to 8(a) certified concerns."],
  ["8a with 'firms'", "Items under this action are available for award only to 8(a) certified firms."],
];

console.log("=== 8(a) gap boundary ===");
for (const [name, bar] of CASES) console.log(`  ${run(bar)}  ${name}`);
