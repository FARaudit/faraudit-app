// JUDGE probe 1 — marker protection completeness.
// Enumerate EVERY field deriveVerdict + helpers read that could move a pole, and assert:
//   (a) any finding carrying that marker is PROTECTED (not fdBaseAbsorbable) OR
//   (b) the survivor construction provably re-derives/OR-preserves it.
// The claim under test: FD_ABSORBABLE_KEYS is complete — no verdict-driving marker can ride
// on an absorbable (silently-dropped) non-primary member and be lost.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const VI = (findings: TypedFinding[], profile: any = null, source?: string): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, source } as any);

const V = (f: TypedFinding[], p: any = null, s?: string) => deriveVerdict(VI(f, p, s)).verdict;

let breaks = 0;
const R = (name: string, ok: boolean, detail = "") => {
  if (!ok) breaks++;
  console.log(`${ok ? "PASS" : "**BREAK**"}  ${name}${detail ? "  — " + detail : ""}`);
};

const clause = (extra: Partial<TypedFinding> = {}): TypedFinding => ({
  id: "x", requirement: "Comply with FAR 52.212-4 contract terms.", citation: "FAR 52.212-4",
  excerpt: "", kind: "submission", controllability: "bidder_controls", severity: "P2", grounded: true, ...extra,
} as TypedFinding);

// ---- ATTACK A: a NON-BAR finding carrying `mmEvidenceFactor` as an absorbable dup.
// mmEvidenceFactor is NOT in FD_ABSORBABLE_KEYS → must be PROTECTED (pass through).
// If it were absorbed and its kind=eligibility_bar/requiredAttribute survived on a sibling,
// the unverifiedGates filter (which EXCLUDES mmEvidenceFactor findings) could flip.
{
  // panelA: a §M evidence-factor finding, DEMOTED to bidder_controls, kind eligibility_bar, requiredAttribute set,
  //         mmEvidenceFactor=true → deriveVerdict EXCLUDES it from unverifiedGates (no clamp).
  const A = clause({ id: "a", controllability: "bidder_controls", kind: "eligibility_bar",
    requiredAttribute: "setaside:sb", mmEvidenceFactor: true, cautionFloor: true, curableInWindow: true });
  // panelB: same clause, plain non-bar dup with NO mmEvidenceFactor but SAME kind+requiredAttribute.
  //         If B absorbs A (or A absorbs B losing the marker) and survivor lacks mmEvidenceFactor,
  //         the eligibility_bar+requiredAttribute survivor would ENTER unverifiedGates → tristate clamp.
  const B = clause({ id: "b", controllability: "bidder_controls", kind: "eligibility_bar",
    requiredAttribute: "setaside:sb", cautionFloor: true, curableInWindow: true });
  const before = V([A, B], null, "src");
  const after = V(applyFindingDedup([A, B], { enabled: true }), null, "src");
  R("A mmEvidenceFactor non-bar dup: verdict invariant (null)", before === after, `${before} -> ${after}`);
  // A is protected (mmEvidenceFactor ∉ absorbable) → both must survive OR at least the marker persists.
  const out = applyFindingDedup([A, B], { enabled: true });
  const anyMm = out.some((f) => (f as any).mmEvidenceFactor);
  R("A mmEvidenceFactor survives dedup", anyMm, `rows=${out.length}, mm=${anyMm}`);
}

// ---- ATTACK B: cautionFloor on a NON-BAR absorbed member — is the floor preserved?
{
  const withFloor = clause({ id: "a", cautionFloor: true, curableInWindow: true });
  const plain = clause({ id: "b" });  // no floor, plain non-bar
  // survivor OR's cautionFloor → floored branch must still fire.
  const before = V([withFloor, plain]);
  const merged = applyFindingDedup([withFloor, plain], { enabled: true });
  const after = V(merged);
  R("B cautionFloor OR-preserved across absorb", before === after && before === "BID_WITH_CAUTION",
    `${before} -> ${after}, rows=${merged.length}`);
}

// ---- ATTACK C: cautionFloor rides ONLY on the absorbed (non-primary) member, primary is plain.
//      Order matters: primary is chosen by ctrl/sev/req-length. Put floor on the LOSER.
{
  // both bidder_controls; primary picked by requirement length (longer wins). Give the FLOOR one the SHORTER req.
  const floorShort = clause({ id: "a", requirement: "FAR 52.212-4 short.", cautionFloor: true, curableInWindow: true });
  const plainLong = clause({ id: "b", requirement: "FAR 52.212-4 a much much longer requirement text here indeed." });
  const before = V([floorShort, plainLong]);
  const merged = applyFindingDedup([floorShort, plainLong], { enabled: true });
  const after = V(merged);
  const survivorHasFloor = merged.some((f) => (f as any).cautionFloor);
  R("C cautionFloor on absorbed loser preserved", before === after && survivorHasFloor,
    `${before} -> ${after}, floorOnSurvivor=${survivorHasFloor}`);
}

// ---- ATTACK D: `curableInWindow` on a non-bar survivor. Survivor only sets curableInWindow when isBar.
//      Non-bar survivor inherits primary.curableInWindow via spread. Can a non-bar dup's curableInWindow
//      difference move a pole? residual (5c) requires disqualifying disposition, so non-bar can't reach it.
//      Confirm empirically: two non-bar dups with differing curableInWindow → invariant.
{
  const cw = clause({ id: "a", cautionFloor: true, curableInWindow: true });
  const noCw = clause({ id: "b", cautionFloor: true, curableInWindow: false });
  const before = V([cw, noCw]);
  const after = V(applyFindingDedup([cw, noCw], { enabled: true }));
  R("D non-bar differing curableInWindow: invariant", before === after, `${before} -> ${after}`);
}

console.log(`\n=== JUDGE-MARKERS: ${breaks} break(s) ===`);
process.exit(breaks ? 1 : 0);
