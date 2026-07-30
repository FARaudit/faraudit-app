// Isolate the skip cause for the 8(a) belt-evasion candidate + probe realistic variants of the SAME shape.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf, isBidderSelfDeterminableSentence } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

const BENIGN = "Government-furnished property will be provided at the contractor's facility during performance.";
const mkFinding = (sec: string, ex: string): TypedFinding =>
  ({ id: "f_b", citation: `§${sec}`, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

const run = (sec: string, bar: string) => {
  const src = [`SECTION ${sec} - TEST`, BENIGN, bar].join("\n");
  const r = completenessOf({ fullSource: src } as any, [sec], [mkFinding(sec, BENIGN)], new Set([sec]));
  return r.attestations.find((x) => x.section === sec)?.status;
};

// The RE-normalized sentence the floor actually sees (lowercased via norm).
const CANDIDATES = [
  // The original candidate — thing-lead + no offeror noun + 8(a) (no set-aside token) + no clearance/registration.
  "Provisions of this notice make only 8(a) program participants eligible to receive award under this action.",
  // Realistic FBO/SAM phrasings of an 8(a) restriction that lead with a thing-noun and avoid offeror nouns:
  "Codes assigned under this notice make only certified 8(a) participants eligible for award.",
  "Items procured herein are available only to 8(a) program participants; ineligible parties will be rejected.",
  "Clauses incorporated restrict this action to 8(a) participants who are eligible for award.",
  // WITHOUT thing-lead (control — should floor via fall-through):
  "Only 8(a) program participants are eligible to receive award under this action.",
  // With an offeror noun (control — belt1 floors):
  "Provisions of this notice make only 8(a) offerors eligible to receive award under this action.",
];

console.log("=== 8(a) belt-evasion shape battery ===");
for (const c of CANDIDATES) {
  const st = run("C", c);
  const selfCert = isBidderSelfDeterminableSentence(c.toLowerCase());
  const flag = st === "obligations_ungrounded" ? "FLOOR" : (st === "covered_direct" ? "SKIP " : st);
  console.log(`  ${flag}  selfCertDemote=${selfCert}  "${c.slice(0, 78)}"`);
}
