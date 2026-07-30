import { applyFindingDedup, deriveVerdict, firmStatus, disposeFinding } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
const base = (o: any): TypedFinding => ({ id: o.id, requirement: o.requirement, citation: o.citation, excerpt: "", kind: o.kind, controllability: o.controllability, grounded: true, lens: "L", ...o });
const primary = base({ id: "MM2", citation: "FAR 52.219-9", requirement: "M-factor", controllability: "bidder_controls", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true, mmEvidenceFactor: true });
const plain = base({ id: "HB2", citation: "FAR 52.219-9", requirement: "plain hard bar no attribute", controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false });
const findings = [primary, plain];
const dd = applyFindingDedup(findings, { enabled: true });
console.log("dedup len", dd.length);
const surv: any = dd[0];
console.log("survivor:", JSON.stringify({ ctrl: surv.controllability, kind: surv.kind, attr: surv.requiredAttribute, cur: surv.curableInWindow, mm: surv.mmEvidenceFactor, caut: surv.cautionFloor }));
console.log("plain disposition:", disposeFinding(plain), "plain firmStatus(ow-sb):", firmStatus(plain, { satisfiedAttributes: ["setaside:sb"], closedWorld: false } as BidderProfile));
console.log("surv firmStatus(ow-sb):", firmStatus(surv, { satisfiedAttributes: ["setaside:sb"], closedWorld: false } as BidderProfile));
for (const p of [null, { satisfiedAttributes: ["setaside:sb"], closedWorld: false }, { satisfiedAttributes: [], closedWorld: false }, { satisfiedAttributes: [], closedWorld: true }, { satisfiedAttributes: ["setaside:sb"], closedWorld: true }] as (BidderProfile | null)[]) {
  const vi = (f: TypedFinding[]) => ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false }) as any;
  const full = deriveVerdict(vi(findings)), ded = deriveVerdict(vi(dd));
  const tag = p ? (p.closedWorld ? "cw" : "ow") + JSON.stringify(p.satisfiedAttributes) : "null";
  console.log(`${full.verdict === ded.verdict && full.eligible === ded.eligible ? "OK " : "BRK"} ${tag}: full=${full.verdict}/${full.eligible} dedup=${ded.verdict}/${ded.eligible}`);
}
