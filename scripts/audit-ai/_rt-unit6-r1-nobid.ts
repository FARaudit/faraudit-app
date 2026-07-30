// RT Unit6 R1 — PROVE the NO_BID pole-flip: a properly-VERIFIED universalDefect that is NOT the merge
// primary gets its universalDefect/verifiedBy stripped by `...primary` → NO_BID vanishes.
import { applyFindingDedup, deriveVerdict, registerVerifier, excerptHash, isVerifiedUniversalDefect } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
process.env.AUDIT_FOURWALLS_NOBID = "true"; // allow the verified universalDefect to reach NO_BID
registerVerifier("rt-verifier");

type F = TypedFinding;
const mk = (o: Partial<F>): F => ({
  requirement: "", citation: "", excerpt: "", kind: "other",
  controllability: "bidder_controls", grounded: true, ...o,
} as F);
const vi = (findings: F[]) => ({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as any);

const defectExcerpt = "The delivery must occur both before and after the same fixed date — internally contradictory.";
const uMember = mk({
  citation: "52.211-7",
  requirement: "internally contradictory mandatory terms",   // SHORT → loses length tie-break
  excerpt: defectExcerpt,
  grounded: true,
  controllability: "no_one_can_move",
  curableInWindow: false,
  severity: "P2",                                            // LOW → loses severity tie-break
  universalDefect: "contradictory_mandatory_terms",
  verifiedBy: { verifierId: "rt-verifier", affirmation: "confirmed contradictory", excerptHash: excerptHash(defectExcerpt) } as any,
});
console.log("uMember is a VERIFIED universal defect:", isVerifiedUniversalDefect(uMember));

// A co-member on the SAME clause that OUT-SORTS the defect (same controllability rank 4, but HIGHER severity P0
// and LONGER requirement) → it becomes `primary` → survivor = {...primary} → universalDefect mark DROPPED.
const otherHi = mk({
  citation: "52.211-7",
  requirement: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA a long non-defect finding that references the same clause",
  controllability: "no_one_can_move",
  curableInWindow: false,
  severity: "P0",
});

const findings = [uMember, otherHi];
const full = deriveVerdict(vi(findings));
const ded = applyFindingDedup(findings, { enabled: true });
const surv = ded.find((f) => (f as any).findingDedupMerged) as any;
const after = deriveVerdict(vi(ded));

console.log(`survivor.universalDefect=${surv?.universalDefect}  verifiedBy=${!!surv?.verifiedBy}  survivorIsVerifiedDefect=${isVerifiedUniversalDefect(surv)}`);
console.log(`FULL   verdict=${full.verdict}  eligible=${full.eligible}`);
console.log(`DEDUP  verdict=${after.verdict}  eligible=${after.eligible}`);
console.log(full.verdict === after.verdict && full.eligible === after.eligible
  ? "ok verdict-safe"
  : `*** VERDICT-UNSAFE — POLE FLIP ${full.verdict} -> ${after.verdict} (verified NO_BID defect stripped on merge)`);

delete process.env.AUDIT_ELIGIBLE_TRISTATE;
delete process.env.AUDIT_FOURWALLS_NOBID;
