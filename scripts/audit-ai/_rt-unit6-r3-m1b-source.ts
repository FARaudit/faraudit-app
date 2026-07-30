/* Bound the M1b break WITH a source (prod threads ctx.fullSource). firmStatus grounds the requiredAttribute
   under closed-world; open-world canonical match is source-independent. */
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";
const base = (o: any): TypedFinding => ({ id: o.id, requirement: o.requirement, citation: o.citation, excerpt: o.excerpt ?? "", kind: o.kind, controllability: o.controllability, grounded: true, lens: "L", ...o });
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
// setaside:sb canonicalizes; use it so open-world canonical self-clear applies.
const primary = base({ id: "MM2", citation: "FAR 52.219-9", requirement: "M-factor small business set-aside", controllability: "bidder_controls", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true, mmEvidenceFactor: true });
const plain = base({ id: "HB2", citation: "FAR 52.219-9", requirement: "plain non-curable eligibility bar the lens gave no attribute", controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false });
const findings = [primary, plain];
const dd = applyFindingDedup(findings, { enabled: true });
// source that GROUNDS the attribute string vs one that does NOT
const srcGround = "setaside:sb small business set-aside FAR 52.219-9";
const srcNoGround = "unrelated solicitation text with no attribute token present here at all";
for (const [label, source] of [["grounded-src", srcGround], ["ungrounded-src", srcNoGround], ["no-src", undefined]] as [string, string | undefined][]) {
  console.log(`--- ${label} ---`);
  for (const p of [null, { satisfiedAttributes: ["setaside:sb"], closedWorld: false }, { satisfiedAttributes: [], closedWorld: true }, { satisfiedAttributes: ["setaside:sb"], closedWorld: true }] as (BidderProfile | null)[]) {
    const vi = (f: TypedFinding[]) => ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false, source }) as any;
    const full = deriveVerdict(vi(findings)), ded = deriveVerdict(vi(dd));
    const tag = p ? (p.closedWorld ? "cw" : "ow") + JSON.stringify(p.satisfiedAttributes) : "null";
    console.log(`  ${full.verdict === ded.verdict && full.eligible === ded.eligible ? "OK " : "BRK"} ${tag}: full=${full.verdict}/${full.eligible} dedup=${ded.verdict}/${ded.eligible}`);
  }
}
