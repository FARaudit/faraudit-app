/* R1 + R2 regression guard — confirm all prior breaks stay CLOSED. */
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";
const base = (o: any): TypedFinding => ({ id: o.id, requirement: o.requirement, citation: o.citation, excerpt: o.excerpt ?? "", kind: o.kind ?? "submission", controllability: o.controllability ?? "bidder_controls", grounded: true, lens: "L", ...o });
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
const P = [null, { satisfiedAttributes: [], closedWorld: false }, { satisfiedAttributes: [], closedWorld: true }, { satisfiedAttributes: ["nonmanufacturer:compliant"], closedWorld: false }] as (BidderProfile | null)[];
let fails = 0;
function inv(name: string, findings: TypedFinding[]) {
  const dd = applyFindingDedup(findings, { enabled: true });
  for (const p of P) {
    const vi = (f: TypedFinding[]) => ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false }) as any;
    const full = deriveVerdict(vi(findings)), ded = deriveVerdict(vi(dd));
    if (full.verdict !== ded.verdict || full.eligible !== ded.eligible) {
      fails++;
      const tag = p ? (p.closedWorld ? "cw" : "ow") + JSON.stringify(p.satisfiedAttributes) : "null";
      console.log(`REGRESSION [${name}] ${tag}: full=${full.verdict}/${full.eligible} dedup=${ded.verdict}/${ded.eligible}`);
      return;
    }
  }
  console.log(`OK   ${name}`);
}

// R1 P0 — marker-strip: nmr-marked verified bar as NON-primary member must not lose its markers → pole flip.
inv("R1-P0-nmr-nonprimary", [
  base({ id: "a", citation: "FAR 52.219-33", requirement: "flowdown clause restated", controllability: "bidder_controls", kind: "clause_flowdown", severity: "P2" }),
  base({ id: "b", citation: "FAR 52.219-33", requirement: "NMR bar the firm must meet", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "nonmanufacturer:compliant", curableInWindow: false, nmrGuard: true }),
]);

// R2 P0-1 — forced protected demoted (bidder_controls, structuralWhitelistGuard) survivor absorbing a plain BAR must NOT soften it.
inv("R2-P0-1-forced-demoted-eats-bar", [
  base({ id: "a", citation: "FAR 52.225-2", requirement: "demoted compliance item", controllability: "bidder_controls", kind: "submission", cautionFloor: true, structuralWhitelistGuard: true } as any),
  base({ id: "b", citation: "FAR 52.225-2", requirement: "raw non-curable bar", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "cert:z", curableInWindow: false }),
]);

// R2 P0-2 — boilerplate primary must NOT make cluster decision content vanish.
inv("R2-P0-2-boilerplate-primary", [
  base({ id: "a", citation: "FAR 52.232-33", requirement: "boilerplate EFT clause", controllability: "bidder_controls", kind: "boilerplate", severity: "P2" }),
  base({ id: "b", citation: "FAR 52.232-33", requirement: "real submission obligation", controllability: "bidder_controls", kind: "submission", severity: "P1" }),
]);

console.log(`\n=== REGRESSION: ${fails} reopened breaks ===`);
