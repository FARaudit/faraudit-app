/* Generalize M1b: is `mmEvidenceFactor` essential, or does ANY protected primary carrying a requiredAttribute,
   forced-survivor over an attribute-LESS plain hard bar (worst), fabricate a typed bar from an untyped one? */
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";
const base = (o: any): TypedFinding => ({ id: o.id, requirement: o.requirement, citation: o.citation, excerpt: o.excerpt ?? "", kind: o.kind, controllability: o.controllability, grounded: true, lens: "L", ...o });
const owSat: BidderProfile = { satisfiedAttributes: ["cert:x"], closedWorld: false } as BidderProfile;
const cwFail: BidderProfile = { satisfiedAttributes: [], closedWorld: true } as BidderProfile;
const P = [null, owSat, cwFail] as (BidderProfile | null)[];
let fails = 0;
function inv(name: string, findings: TypedFinding[]) {
  const dd = applyFindingDedup(findings, { enabled: true });
  const surv: any = dd.find((f: any) => f.findingDedupMerged) ?? dd[0];
  for (const p of P) {
    const vi = (f: TypedFinding[]) => ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false }) as any;
    const full = deriveVerdict(vi(findings)), ded = deriveVerdict(vi(dd));
    if (full.verdict !== ded.verdict || full.eligible !== ded.eligible) {
      fails++;
      const tag = p ? (p.closedWorld ? "cw" : "ow") + JSON.stringify(p.satisfiedAttributes) : "null";
      console.log(`BREAK [${name}] ${tag}: full=${full.verdict}/${full.eligible} dedup=${ded.verdict}/${ded.eligible} | surv{ctrl:${surv.controllability},attr:${surv.requiredAttribute},cur:${surv.curableInWindow}}`);
      return;
    }
  }
  console.log(`OK   ${name}`);
}
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";

// Variant A: protected primary via requiredAttribute alone (NO mm). requiredAttribute is excluded from FD_ABSORBABLE_KEYS,
// so an attribute-bearing member is PROTECTED even without any guard marker.
const attrPrimary = base({ id: "AP", citation: "FAR 52.209-5", requirement: "the firm must hold cert:x per this clause", controllability: "bidder_controls", kind: "eligibility_bar", requiredAttribute: "cert:x", curableInWindow: true });
const plainBarNoAttr = base({ id: "PBA", citation: "FAR 52.209-5", requirement: "a non-curable eligibility bar the lens gave no attribute", controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false });
inv("A-attr-primary-noguard", [attrPrimary, plainBarNoAttr]);

// Variant B: protected primary is ALREADY_SATISFIED (met) with attribute; plain hard bar no attr.
const satPrimary = base({ id: "SP", citation: "FAR 52.209-6", requirement: "firm already holds cert:x", controllability: "already_satisfied", kind: "eligibility_bar", requiredAttribute: "cert:x" });
const plainBar2 = base({ id: "PB2", citation: "FAR 52.209-6", requirement: "untyped hard bar", controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false });
inv("B-satisfied-primary-noguard", [satPrimary, plainBar2]);

// Variant C: worst is a CURABLE typed bar (attr) vs primary attr differs -> but fdMergeCompatible blocks differing attrs.
// So confirm the compatibility guard prevents differing-attr merge (should be OK / no merge).
const attrA = base({ id: "AA", citation: "FAR 52.209-7", requirement: "hold cert:x", controllability: "bidder_controls", kind: "eligibility_bar", requiredAttribute: "cert:x" });
const attrB = base({ id: "AB", citation: "FAR 52.209-7", requirement: "hold cert:y non curable", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "cert:y", curableInWindow: false });
inv("C-differing-attrs-blocked", [attrA, attrB]);

console.log(`\n=== GENERAL: ${fails} breaks ===`);
