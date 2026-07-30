/* R4 core — the 1-protected forced-survivor path where worst != primary.
   forced primary = the single protected member (markers ride via {...primary}).
   worst = the most-disqualifying member over ALL members — CAN be a PLAIN member.
   So: markers X from protected primary + disposition Y from a plain worst.
   Enumerate every marker deriveVerdict reads and check the cross-product produces a
   state NO real member held that moves a pole / drops a concern. */
import { applyFindingDedup, deriveVerdict, NMR_ATTRIBUTE } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "../../src/lib/audit-findings";

const ON = { enabled: true };
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "FAR 52.222-1", excerpt: "x", kind: "other",
  controllability: "bidder_controls", grounded: true, lens: "L", ...o,
});
const vi = (findings: TypedFinding[], p: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false });
function pole(fs: TypedFinding[], p: BidderProfile | null) { const d = deriveVerdict(vi(fs, p)); return `${d.verdict}/${d.eligible}`; }
function cmp(name: string, fs: TypedFinding[], p: BidderProfile | null) {
  const off = pole(fs, p);
  const dd = applyFindingDedup(fs, ON);
  const on = pole(dd, p);
  const flip = off !== on;
  console.log(`[${name}] OFF=${off} ON=${on} (${fs.length}->${dd.length})${flip ? "  <<< FLIP" : ""}`);
  if (flip) console.log("   survivor:", dd.filter(f => f.findingDedupMerged).map(f =>
    `{ctrl:${f.controllability},kind:${f.kind},cure:${f.curableInWindow},attr:${f.requiredAttribute},nmr:${f.nmrGuard},mm:${f.mmEvidenceFactor},ud:${f.universalDefect},vb:${!!f.verifiedBy},cf:${f.cautionFloor}}`));
  return flip;
}
process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
let breaks = 0;

// Profiles
const nullP: BidderProfile | null = null;
const nmrCompliant: BidderProfile = { satisfiedAttributes: ["nonmanufacturer:compliant"] };

// ── nmrGuard from primary + worst = plain bar (bidder_cannot_move, non-nmr). Protected primary carries nmrGuard
// (a MARKER only — it need NOT carry requiredAttribute=NMR to be protected; any marker protects it).
// Give the primary nmrGuard but make it look like a mild caution (bidder_controls). Worst plain = a hard bar.
// R3 attr from worst (plain => undefined). Survivor: bidder_cannot_move + nmrGuard=true + attr=undefined + cure from worst.
// deriveVerdict: unknownBars => untyped (no attr) => branch 5a NHR (fail closed). But wait — 5b-NMR needs curable=false&nmrGuard.
// The key: nmrGuard=true diverts branch 5b (nonCurable EXCLUDES nmrGuard) — is the plain structural bar's
// hold-it-or-walk SUPPRESSED and re-routed to the softer NMR "typically achievable" message?
const nmrPrimary_mildcaution = base({ citation: "FAR 52.219-33", requirement: "nmr advisory context",
  controllability: "bidder_controls", curableInWindow: true, nmrGuard: true }); // protected via nmrGuard; NOT a bar itself
const plainStructBar = base({ citation: "FAR 52.219-33", requirement: "hard non-curable structural bar (no attr)",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false }); // plain absorbable
breaks += cmp("nmrGuard-primary + plain nonCurable worst", [nmrPrimary_mildcaution, plainStructBar], nullP) ? 1 : 0;

// Same but with the untyped guard defeated: give the plain bar behaviour where survivor ends up with curable=false.
// Actually survivor attr=undefined => 5a untyped catches it first. Test if nmrGuard changes 5a vs 5b vs 5b-nmr ordering.
// Add a requiredAttribute path: make primary carry attr (protected) is different. Instead: two plain bars + nmr primary.
const plainBarTyped = base({ citation: "FAR 52.219-33", requirement: "structural bar typed",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false }); // still no attr (plain)
// To get attr on the survivor from worst, worst must be protected. Combine: 1 nmr primary + 1 attr-bearing bar.
// Both protected => >=2 protected => only PLAINS merge. So no cross-product. Confirm the constraint:
const attrBar = base({ citation: "FAR 52.219-33", requirement: "attr bar", controllability: "bidder_cannot_move",
  kind: "eligibility_bar", curableInWindow: false, requiredAttribute: "facility-clearance" });
breaks += cmp("2-protected(nmr+attr) => plains only", [nmrPrimary_mildcaution, attrBar, plainStructBar], nullP) ? 1 : 0;

// ── mmEvidenceFactor from primary + worst = plain eligibility_bar (kind eligibility_bar, NO attr => plain absorbable).
// unverifiedGates requires requiredAttribute, so an attr-less eligibility_bar worst won't clamp anyway. The DANGER is
// the reverse: mmEvidenceFactor on survivor EXCLUDES it from unverifiedGates. But survivor needs kind=eligibility_bar
// AND requiredAttribute to be an unverifiedGate at all — attr only from protected worst => forced-primary path collapses.
// So try: primary = mmEvidenceFactor + kind eligibility_bar + requiredAttribute (protected), worst = plain (no attr).
// Then survivor attr from worst=undefined => NOT an unverifiedGate regardless. The clamp is DROPPED vs a full set
// where the mm-primary itself (kind elig + attr but mmEvidenceFactor) is ALSO excluded. So OFF also excludes it. Same.
// BUT: full set has the mm finding AS a separate row (kind elig, attr, mmEvidenceFactor => excluded) — matches. OK.
const mmPrimary = base({ citation: "FAR 52.212-3", requirement: "mm evidenced factor",
  controllability: "bidder_controls", kind: "eligibility_bar", curableInWindow: true, cautionFloor: true,
  requiredAttribute: "se:wosb", mmEvidenceFactor: true }); // protected
const plainElig = base({ citation: "FAR 52.212-3", requirement: "another elig note (no attr)",
  controllability: "already_satisfied", kind: "eligibility_bar" }); // plain
breaks += cmp("mm-primary absorbs plain elig", [mmPrimary, plainElig], nullP) ? 1 : 0;

// ── mmEvidenceFactor primary DEMOTED to bidder_controls, but worst = plain ALREADY_SATISFIED elig that under a
// closed-world profile would be a real gate. Hmm attr only on protected. Let profile be closed-world & test firmStatus.
// The real risk: does mmEvidenceFactor riding to a survivor whose DISPOSITION (from worst) is a genuine bar suppress
// the clamp? Need worst to yield kind=eligibility_bar + attr. attr requires worst protected. Confirmed impossible on
// forced-primary path. So mmEvidenceFactor cross-product is STRUCTURALLY blocked by the attr-only-on-protected rule.
console.log("   [note] attr lives ONLY on protected members => worst.requiredAttribute nonempty => worst protected => forced primary; cross-product for attr-reading filters is blocked.");

// ── universalDefect / verifiedBy from primary + worst = plain disqualifying bar.
// universalDefect is NOT in FD_ABSORBABLE_KEYS => a UD finding is protected. So it's forced primary (if sole protected).
// Survivor: universalDefect+verifiedBy from primary, controllability from worst (plain). If worst is bidder_controls
// (non-disqualifying), disposeFinding => gate_to_clear => survivor NOT in `disqualifying` => isUniversalDefect never
// evaluated on it => the VERIFIED NO_BID defect is DROPPED. That's R1's flip in reverse? R1 was markers stripped.
// Here markers RIDE but the DISPOSITION from worst can make disposeFinding drop it out of the disqualifying set.
// UD is unreachable in prod (empty allowlist/verifier) so pole won't move, but test the mechanism shape.
const udPrimary = base({ citation: "FAR 52.222-2", requirement: "contradictory mandatory terms",
  controllability: "no_one_can_move", kind: "other", curableInWindow: false, grounded: true,
  excerpt: "the two clauses contradict", universalDefect: "contradictory_mandatory_terms",
  verifiedBy: { verifierId: "v", excerptHash: "x", affirmation: "a" } }); // protected
const plainSoft = base({ citation: "FAR 52.222-2", requirement: "soft note", controllability: "bidder_controls",
  curableInWindow: true }); // plain, LESS disqualifying than no_one_can_move
breaks += cmp("UD-primary + softer worst (worst wins ctrl?)", [udPrimary, plainSoft], nullP) ? 1 : 0;

console.log(`\n=== forced-vs-worst breaks: ${breaks} ===`);
