// $0 READ-ONLY — does branch 5a (:3846 "missing required typing") intercept findings that branch 5b
// (:3872 "CONDITIONAL NO-BID: hold-it-or-walk") was built to answer decisively? Drives the real deriveVerdict.
import { deriveVerdict } from "../../src/lib/audit-decide";
import { registerJudgmentVerifier } from "../../src/lib/audit-judgment-layer";
import type { TypedFinding } from "../../src/lib/audit-findings";

registerJudgmentVerifier();

const EXCERPT = "This order is restricted to Tinker AFB MAC BOA Holders ONLY.";
const SRC = `Solicitation W58RGZ. ${EXCERPT} clearance:secret-facility`;

// EXACT shape emitted by audit-orchestrator.ts:1489-1498 (notice_body_boa_holder_detector) — verbatim fields.
const asEmitted: TypedFinding = {
  requirement: `Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA/GWAC/MAS) stated in the SAM notice body — a firm that does not hold it CANNOT bid: "${EXCERPT}"`,
  citation: "SAM notice body",
  excerpt: EXCERPT,
  kind: "eligibility_bar",
  controllability: "bidder_cannot_move",
  curableInWindow: false,
  grounded: true,
  lens: "notice_body_boa_holder_detector",
} as TypedFinding;

const base = {
  bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false,
  documentsComplete: true, manifestComplete: true, source: SRC,
};

const show = (label: string, f: TypedFinding) => {
  const d = deriveVerdict({ ...base, findings: [f] } as never);
  console.log(`\n${label}`);
  console.log(`  verdict : ${d.verdict}`);
  console.log(`  reason  : ${d.reason.slice(0, 235)}`);
};

console.log("The finding is IDENTICAL in both runs except for one optional string field.");
show("A. EXACTLY as the engine's own detector emits it (no requiredAttribute)", asEmitted);
show("B. same finding + requiredAttribute set", { ...asEmitted, requiredAttribute: "clearance:secret-facility" });

console.log("\n--- what 5a's own comment says it exists to prevent (audit-decide.ts:3838-3839) ---");
console.log('  "a NON-CURABLE structural bar under a null profile is the SPRS error re-armed');
console.log('   (soft caution where the bidder cannot win and cannot cure) ... an untyped bar');
console.log('   FAILS CLOSED, never silently to caution."');
console.log("\n  But B above is NOT a caution. So 5a is not protecting against the thing it names —");
console.log("  it is intercepting 5b, which already fails closed AND names the decision.");
