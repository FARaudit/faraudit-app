// DRY-CERT — ACCEPTANCE_OBJECT frame masking a real offeror-eligibility bar (assignment-flagged vector) +
// over-fire re-confirmation of the R2 fixes (clean goods/form-field must NOT floor).
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

const BENIGN = "Government-furnished property will be provided during performance.";
const mkF = (sec: string, ex: string): TypedFinding =>
  ({ id: "f", citation: `§${sec}`, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);
const run = (sec: string, bar: string) => {
  const src = [`SECTION ${sec} - TEST`, BENIGN, bar].join("\n");
  return completenessOf({ fullSource: src } as any, [sec], [mkF(sec, BENIGN)], new Set([sec])).attestations.find((x) => x.section === sec)?.status;
};
const F = (s?: string) => s === "obligations_ungrounded" ? "FLOOR" : (s === "covered_direct" ? "SKIP " : s);

console.log("=== ACCEPTANCE_OBJECT frame — must NOT mask a real OFFEROR bar (belt1 should force floor) ===");
// ACCEPTANCE_OBJECT_RE = /(in)?eligib(le|ility)\s...for (acceptance|payment|reimbursement|delivery|inspection)/.
// A real bar "offeror ineligible for payment unless cleared" carries 'offeror' → belt1 must floor.
for (const bar of [
  "The offeror is ineligible for payment unless it holds a Top Secret facility clearance.",  // belt1 offeror + belt2 clearance
  "A contractor lacking CMMC Level 2 is ineligible for payment under this contract.",         // belt1 contractor + belt2 cmmc
  "An offeror is ineligible for award unless debarment has been resolved.",                    // belt1 offeror + belt2 debarred
  // The dangerous one: acceptance-frame + NO offeror noun + NO firm-credential, but a REAL restriction:
  "Work is ineligible for acceptance unless performed by an 8(a) participant certified by SBA.", // 8(a) no set-aside, no offeror noun
]) console.log(`  ${F(run("E", bar))}  ${bar}`);

console.log("\n=== OVER-FIRE re-confirm — genuinely non-bidder sentences must SKIP (stay covered_direct) ===");
for (const [sec, bar] of [
  ["E", "Supplies not conforming to the specification are not eligible for acceptance and may be rejected."],
  ["E", "Nonconforming units are ineligible for acceptance and will be returned at the contractor's expense."],
  ["D", "Enter the value in block 8(a) of the inspection form."],
  ["C", "All welds shall conform to ISO 9001 quality requirements."],
  ["C", "Documents classified up to Top Secret shall be stored in an approved container."],
  ["C", "The NAICS code and its size standard are listed in the notice."],
] as Array<[string,string]>) console.log(`  ${F(run(sec, bar))}  §${sec}: ${bar.slice(0,70)}`);
