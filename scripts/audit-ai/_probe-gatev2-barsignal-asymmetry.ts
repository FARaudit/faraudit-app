// PROBE — importanceOf() releases sentences that hasBarSignal() calls a bar.
//
// `importanceOf` line ~325 (the NOOP-REP family release) tests the RAW `BAR_SIGNAL_RE`. Every sibling branch
// tests `hasBarSignal()`, which is that regex PLUS two arms the raw one does not carry:
//   · REGISTER_TOKENS_RE            (AUDIT_BAR_SIGNAL_REGISTER_TOKENS) — FCL / DD 254 / Part 145 / airworthiness
//   · isPrivateIssuerCredentialBar  (AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR, armed 2026-08-04)
// Both are armed in production, as are all five NOOP-REP members — so at this ONE branch they add no escalation.
// A "boilerplate" return is a full release (gradeCoverageV2 drops it), so the failure direction is FALSE-BID.
//
// The register half is documented at audit-gate-v2.ts:361 as a known limitation. The private-issuer half is not:
// it was armed to ADD escalation and at this branch it adds none.
//
// NOT A GATE — it asserts nothing and owns no verdict. Run it with production flag parity:
//   railway variables --service audit-worker --kv | grep -E '^AUDIT_' | grep -iE '=true$' > /tmp/prodflags.env
//   set -a && source /tmp/prodflags.env && set +a && npx tsx scripts/audit-ai/_probe-gatev2-barsignal-asymmetry.ts
import { importanceOf, hasBarSignal, isPrivateIssuerCredentialBar } from "../../src/lib/audit-gate-v2";

const CASES: Array<[string, string]> = [
  ["precedence + airworthiness certificate (register token)",
   "In the event of any conflict between the offeror's airworthiness certificate and this order, the order of precedence in FAR 52.215-8 shall govern."],
  ["precedence + DD Form 254 (register token)",
   "Where a discrepancy exists between DD Form 254 and this document, the order of precedence shall control."],
  ["protest + authorized distributor for a named OEM (private-issuer arm, armed 2026-08-04)",
   "Any protest shall be served on the Contracting Officer, and the offeror shall maintain its status as an authorized distributor for Caterpillar at all times."],
  ["debrief + Part 145 repair station (register token)",
   "Offerors desiring a debriefing under FAR 15.506 should note the Part 145 repair station certificate referenced herein."],
];

let asym = 0;
for (const [label, ob] of CASES) {
  const imp = importanceOf(ob);
  const bar = hasBarSignal(ob);
  const mismatch = imp === "boilerplate" && bar;
  if (mismatch) asym++;
  console.log(`${mismatch ? "⚠ ASYMMETRY" : "  ok       "}  importanceOf=${imp.padEnd(11)} hasBarSignal=${String(bar).padEnd(5)}  ${label}`);
}
console.log(`\nprivate-issuer recognizer alive: ${isPrivateIssuerCredentialBar("the offeror shall maintain its status as an authorized distributor for Caterpillar at all times")}`);
console.log(`asymmetric cases: ${asym}/${CASES.length}`);
