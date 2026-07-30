/* RED-TEAM Unit6 R3 — seam battery. Each case: same-clause group crafted to break the marker/disposition split. */
import { applyFindingDedup, deriveVerdict, excerptHash, registerVerifier, _clearVerifiers } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";

type VI = Parameters<typeof deriveVerdict>[0];
const mkVI = (findings: TypedFinding[], p: BidderProfile | null): VI =>
  ({ findings, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false } as VI);

const base = (o: Partial<TypedFinding>): TypedFinding => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  requirement: o.requirement ?? "req",
  citation: o.citation ?? "",
  excerpt: o.excerpt ?? "",
  kind: o.kind ?? "submission",
  controllability: o.controllability ?? "bidder_controls",
  grounded: o.grounded ?? true,
  lens: o.lens ?? "L",
  ...o,
} as TypedFinding);

const nullP: BidderProfile | null = null;
const owEmpty: BidderProfile = { satisfiedAttributes: [], closedWorld: false } as BidderProfile;
const cwEmpty: BidderProfile = { satisfiedAttributes: [], closedWorld: true } as BidderProfile;
const allP = [nullP, owEmpty, cwEmpty];

let failCount = 0;
function inv(name: string, findings: TypedFinding[], profiles = allP) {
  const dd = applyFindingDedup(findings, { enabled: true });
  for (const p of profiles) {
    const full = deriveVerdict(mkVI(findings, p));
    const ded = deriveVerdict(mkVI(dd, p));
    if (full.verdict !== ded.verdict || full.eligible !== ded.eligible) {
      failCount++;
      console.log(`BREAK [${name}] p=${p ? (p.closedWorld ? "cw" : "ow") + JSON.stringify(p.satisfiedAttributes) : "null"}`);
      console.log(`   full : ${full.verdict} el=${full.eligible} (n=${findings.length})`);
      console.log(`   dedup: ${ded.verdict} el=${ded.eligible} (n=${dd.length})`);
      console.log(`   survivor markers: ${JSON.stringify(dd.filter((f:any)=>f.findingDedupMerged).map((f:any)=>({ctrl:f.controllability,kind:f.kind,cur:f.curableInWindow,attr:f.requiredAttribute,ud:f.universalDefect,vb:!!f.verifiedBy,nmr:f.nmrGuard,mm:f.mmEvidenceFactor,caut:f.cautionFloor,sev:f.severity,excerpt:f.excerpt})))}`);
      return;
    }
  }
  console.log(`OK   ${name}`);
}

// ── SEAM 1: verifiedBy marker from primary + excerpt from primary — does hash stay valid? ──
// Register a verifier so isVerifiedUniversalDefect CAN pass (prod allowlist empty; but test the mechanism).
registerVerifier("v@test");
const ex1 = "the solicitation demands both A and not-A simultaneously per clause";
const vbPrimary = base({
  id: "P", citation: "FAR 52.222-2", requirement: "contradictory mandatory terms",
  excerpt: ex1, controllability: "no_one_can_move", kind: "other",
  universalDefect: "contradictory_mandatory_terms", grounded: true,
  verifiedBy: { verifierId: "v@test", excerptHash: excerptHash(ex1), affirmation: "affirmed" },
});
// A plain same-clause dup with a LONGER requirement so plain-sort would prefer it, and a DIFFERENT excerpt.
const plainDup1 = base({ id: "Q", citation: "FAR 52.222-2", requirement: "a much longer restatement of the same obligation that is verbose", excerpt: "unrelated neighbouring quote", controllability: "bidder_controls", kind: "submission" });
process.env.AUDIT_FOURWALLS_NOBID = "true"; // enable NO_BID path so universalDefect is verdict-load-bearing
process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; // required by coupling-lock for a universalDefect finding
inv("S1-verifiedBy-hash-survives", [vbPrimary, plainDup1]);
delete process.env.AUDIT_FOURWALLS_NOBID;
delete process.env.AUDIT_ELIGIBLE_TRISTATE;
_clearVerifiers();

// ── SEAM 1b: 0-protected path — markers(primary via ctrl-sort) vs disposition(worst) from DIFFERENT members ──
// Two plain members (both absorbable), one bidder_controls+cautionFloor, one no_one_can_move.
// primary = ctrl-sorted top = the no_one_can_move one. worst = also ctrl-sorted top. Should coincide. Try to split.
const p_hi_ctrl = base({ id: "A", citation: "FAR 52.233-3", requirement: "short", controllability: "no_one_can_move", kind: "other", severity: "P2" });
const p_lo_ctrl_caut = base({ id: "B", citation: "FAR 52.233-3", requirement: "longer requirement text here for tiebreak", controllability: "bidder_controls", kind: "submission", cautionFloor: true, curableInWindow: true, severity: "P0" });
inv("S1b-0protected-split", [p_hi_ctrl, p_lo_ctrl_caut]);

// ── SEAM 2: worst under-states — a bidder_controls member carries mmEvidenceFactor (verdict-relevant), worst picks a bar ──
// Actually test: does dropping a mmEvidenceFactor plain member into a bar survivor lose the mm filter effect?
// mmEvidenceFactor EXCLUDES a finding from unverifiedGates. If a mm-marked eligibility_bar is absorbed, its marker rides only if primary.
const mmBar = base({ id: "M", citation: "FAR 52.219-6", requirement: "mm evidenced factor", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true, mmEvidenceFactor: true });
const plainSameClause = base({ id: "N", citation: "FAR 52.219-6", requirement: "plain dup of the same clause", controllability: "bidder_controls", kind: "submission" });
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
inv("S2-mmEvidenceFactor-marker-ride", [mmBar, plainSameClause]);
delete process.env.AUDIT_ELIGIBLE_TRISTATE;

// ── SEAM 2b: two eligibility_bar members, ONE has requiredAttribute+mmEvidenceFactor(protected), ONE is a plain bar without mm ──
// Under tristate: the plain bar (no mm) is an unverifiedGate → eligible=null. If dedup drops it into the mm survivor,
// does the mm marker suppress the gate that the plain member would have triggered?
const mmProt = base({ id: "MP", citation: "FAR 52.219-8", requirement: "mm factor bar", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: true, cautionFloor: true, mmEvidenceFactor: true });
const plainBarNoMm = base({ id: "PB", citation: "FAR 52.219-8", requirement: "hard eligibility bar the firm must hold", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "setaside:sb", curableInWindow: false });
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
inv("S2b-plainbar-absorbed-into-mm", [mmProt, plainBarNoMm]);
delete process.env.AUDIT_ELIGIBLE_TRISTATE;

// ── SEAM 3: severity vs disposition — severity P0 but worst is bidder_controls/already_satisfied ──
const sevP0controls = base({ id: "S", citation: "FAR 52.204-7", requirement: "sev p0 but controllable", controllability: "bidder_controls", kind: "submission", severity: "P0" });
const sevP2sat = base({ id: "T", citation: "FAR 52.204-7", requirement: "already satisfied dup", controllability: "already_satisfied", kind: "eligibility_bar", severity: "P2" });
inv("S3-severity-vs-disposition", [sevP0controls, sevP2sat]);

// ── SEAM 4: pairwise restatement swallow — a distinct CLIN facet with only a 1-char distinguisher ──
const clin1 = base({ id: "C1", citation: "FAR 52.216-1", requirement: "deliver CLIN 0001 base year quantity as specified" });
const clin2 = base({ id: "C2", citation: "FAR 52.216-1", requirement: "deliver CLIN 0002 base year quantity as specified" });
inv("S4-clin-distinguisher", [clin1, clin2]); // invariance holds (both controllable) but check facet loss separately below

// ── SEAM 5: 3-member mix — protected bar + 2 plain, disjoint object-ids ──
const protBarObj = base({ id: "PBO", citation: "FAR 52.225-1", requirement: "must hold cert DGMT1002 to be eligible", controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "cert:DGMT1002", curableInWindow: false });
const plainObjA = base({ id: "POA", citation: "FAR 52.225-1", requirement: "reference to object ABCD9999 in a note", controllability: "bidder_controls", kind: "submission" });
const plainObjB = base({ id: "POB", citation: "FAR 52.225-1", requirement: "plain restatement no object", controllability: "bidder_controls", kind: "submission" });
inv("S5-3member-mix-disjoint-obj", [protBarObj, plainObjA, plainObjB]);

console.log(`\n=== SEAM BATTERY: ${failCount} invariance breaks ===`);
