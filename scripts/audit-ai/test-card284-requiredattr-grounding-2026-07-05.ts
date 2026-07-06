// PERMANENT REGRESSION — Brain card 284: a closed-world INELIGIBLE bar must be GROUNDED in the document (I8).
// An ungrounded / model-named requiredAttribute is a FABRICATED bar → fail SAFE to NHR, never a false INELIGIBLE.
// Verify (as Brain specified): closed-world profile + finding {bidder_cannot_move, requiredAttribute NOT in source,
// excerpt = real substring} + proposed INELIGIBLE → NHR, not INELIGIBLE. Grounded → unchanged. No-source → unchanged.
import { firmStatus, requiredAttributeGrounded, deriveVerdict } from "@/lib/audit-decide";
import type { TypedFinding, BidderProfile, VerdictInputs } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

const SOURCE = "SECTION C — REQUIREMENTS\nThe contractor shall hold an active secret facility clearance at time of award.\nOfferors must be a verified Service-Disabled Veteran-Owned Small Business.";
const closed: BidderProfile = { satisfiedAttributes: [], closedWorld: true };

const bar = (requiredAttribute: string, excerpt: string): TypedFinding => ({
  requirement: "bar", citation: "§C", excerpt, kind: "eligibility_bar", controllability: "bidder_cannot_move",
  requiredAttribute, curableInWindow: false, grounded: true, lens: "x",
});
const inp = (findings: TypedFinding[], source?: string): VerdictInputs =>
  ({ findings, bidderProfile: closed, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true, ...(source !== undefined ? { source } : {}) });

// ── requiredAttributeGrounded primitive ──
ok("grounded: value verbatim in source", requiredAttributeGrounded("secret facility clearance", SOURCE), true);
ok("grounded: canonical ns:value where value is in source", requiredAttributeGrounded("clearance:secret facility clearance", SOURCE), true);
ok("UNGROUNDED: fabricated attr not in source", requiredAttributeGrounded("clearance:top-secret-sci", SOURCE), false);
ok("UNGROUNDED: model-named bar absent from doc", requiredAttributeGrounded("cmmc:level-3", SOURCE), false);

// ── firmStatus with source (the closed-world gate) ──
const fabricated = bar("clearance:top-secret-sci", "verified Service-Disabled Veteran-Owned Small Business"); // real excerpt, fake attr
ok("closed-world + UNGROUNDED attr + source → unknown (NHR, not fails)", firmStatus(fabricated, closed, SOURCE), "unknown");
const grounded = bar("secret facility clearance", "active secret facility clearance");
ok("closed-world + GROUNDED attr + source → fails (unchanged)", firmStatus(grounded, closed, SOURCE), "fails");
ok("closed-world + UNGROUNDED attr + NO source → fails (byte-identical, gate skipped)", firmStatus(fabricated, closed), "fails");

// ── deriveVerdict end-to-end (the attack + the legit case) ──
ok("ATTACK: fabricated closed-world bar + source → NOT INELIGIBLE (fail-safe NHR)", deriveVerdict(inp([fabricated], SOURCE)).verdict !== "INELIGIBLE", true);
ok("legit grounded closed-world bar + source → INELIGIBLE (unchanged)", deriveVerdict(inp([grounded], SOURCE)).verdict, "INELIGIBLE");
ok("no source threaded → INELIGIBLE (byte-identical to pre-284)", deriveVerdict(inp([fabricated])).verdict, "INELIGIBLE");

console.log("\ncard 284 — requiredAttribute grounding gate");
for (const f of fails) console.log(`  ✗  ${f}`);
console.log(fails.length === 0 ? `\n✅ ALL GREEN — ${pass} passed, 0 failed` : `\n❌ ${fails.length} FAILED — ${pass} passed`);
if (fails.length) process.exit(1);
