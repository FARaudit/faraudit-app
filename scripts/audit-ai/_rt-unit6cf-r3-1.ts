/* RED-TEAM R3-1 — ATTACK 1: a verdict-driving READ deriveVerdict makes that is NOT ctrl/kind/severity alone.
 * Target: selfClearablePackageBars (card #590, called by deriveVerdict at step 4b) reads kind×controllability
 * JOINTLY on ALL live findings (plains included) and scans requirement+excerpt+requiredAttribute package-wide
 * (hasLongLeadCredential). The dedup survivor takes ctrl-max and kind-max INDEPENDENTLY → can manufacture a
 * kind×ctrl COMBINATION (eligibility_bar × bidder_controls) that exists on NO member, and DROPS absorbed
 * members' excerpts. Both are verdict-live under AUDIT_SELF_CLEARABLE_PACKAGE=true. */
process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
import { applyCrossFleetDedup, applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? "✅" : "❌ BREAK"} ${msg}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as VerdictInputs);
const tuple = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };
const pipeline = (fs: TypedFinding[]) => applyCrossFleetDedup(applyFindingDedup(fs, { enabled: true }), { enabled: true });

// CASE 1 — COMPOSITE kind×ctrl. Member A: eligibility_bar × already_satisfied (met status recital — NOT a self-cert
// bar). Member B: submission × bidder_controls (a dated deadline). NO member is (eligibility_bar × bidder_controls).
// Survivor = ctrl-max(bidder_controls, from B) + kind-max(eligibility_bar, from A) ⇒ a self-cert bar that never existed.
{
  const A = F({ requirement: "SDVOSB set-aside status is confirmed current for this procurement; offers are due July 22, 2026.", kind: "eligibility_bar", controllability: "already_satisfied", severity: "P2" });
  const B = F({ requirement: "Submit your offer by July 22, 2026 through SAM.gov.", kind: "submission", controllability: "bidder_controls", severity: "P2" });
  const off = tuple([A, B]);
  const merged = pipeline([A, B]);
  const on = tuple(merged);
  console.log(`   CASE 1: OFF=${off}  ON=${on}  survivor kind×ctrl = ${merged[0].kind} × ${merged[0].controllability} (members: elig_bar×already_satisfied, submission×bidder_controls)`);
  ok(off === on, `CASE 1 invariant: verdict tuple identical ON vs OFF (OFF=${off} ON=${on})`);
}

// CASE 2 — EXCERPT LOSS is verdict-live. Member A: eligibility_bar × bidder_controls (a genuine self-cert bar, both
// paths). Member B: plain submission finding whose EXCERPT carries a long-lead credential (CMMC). OFF: package-wide
// hasLongLeadCredential sees B.excerpt ⇒ recognizer inert ⇒ ladder. ON: worst=A (kind rank) ⇒ survivor.excerpt=A's ⇒
// B's CMMC excerpt VANISHES ⇒ recognizer fires. FD_VERDICT_INERT_ON_PLAINS documents excerpt as inert — falsified.
{
  const A = F({ requirement: "Confirm active SAM registration before offers are due July 22, 2026.", kind: "eligibility_bar", controllability: "bidder_controls", severity: "P2", excerpt: "Offerors shall be registered in SAM at time of offer." });
  const B = F({ requirement: "Proposals must be received by July 22, 2026 at 2:00 PM CT.", kind: "submission", controllability: "bidder_controls", severity: "P2", excerpt: "Contractor systems shall maintain CMMC Level 2 certification for covered defense information." });
  const off = tuple([A, B]);
  const merged = pipeline([A, B]);
  const on = tuple(merged);
  console.log(`   CASE 2: OFF=${off}  ON=${on}  survivor.excerpt="${merged[0].excerpt}" (CMMC excerpt ${/cmmc/i.test(merged.map(f => f.excerpt ?? "").join(" ")) ? "retained" : "LOST"})`);
  ok(off === on, `CASE 2 invariant: verdict tuple identical ON vs OFF (OFF=${off} ON=${on})`);
}

// CASE 3 — same composite as CASE 1 but with a PROTECTED curable disqualifier present (realistic mixed record):
// OFF ladder lands 5c BID_WITH_CAUTION/eligible=true; ON recognizer returns BID_WITH_CAUTION/eligible=null.
{
  const A = F({ requirement: "8(a) program status verified current; quotes due July 22, 2026.", kind: "eligibility_bar", controllability: "already_satisfied", severity: "P2" });
  const B = F({ requirement: "Quotes are due no later than July 22, 2026.", kind: "submission", controllability: "bidder_controls", severity: "P2" });
  const C = F({ requirement: "Offeror must obtain state contractor license before performance.", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: true, requiredAttribute: "license:state-contractor", severity: "P1" });
  const off = tuple([A, B, C]);
  const on = tuple(pipeline([A, B, C]));
  console.log(`   CASE 3: OFF=${off}  ON=${on}`);
  ok(off === on, `CASE 3 invariant: verdict tuple identical ON vs OFF (OFF=${off} ON=${on})`);
}

// CASE 4 — control: same CASE-1 inputs under DEFAULT env (recognizer flag OFF) must be invariant (scopes the break).
{
  delete process.env.AUDIT_SELF_CLEARABLE_PACKAGE;
  const A = F({ requirement: "SDVOSB set-aside status is confirmed current for this procurement; offers are due July 22, 2026.", kind: "eligibility_bar", controllability: "already_satisfied", severity: "P2" });
  const B = F({ requirement: "Submit your offer by July 22, 2026 through SAM.gov.", kind: "submission", controllability: "bidder_controls", severity: "P2" });
  const off = tuple([A, B]);
  const on = tuple(pipeline([A, B]));
  ok(off === on, `CASE 4 control (default env): invariant holds (OFF=${off} ON=${on})`);
  process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
}

console.log(fails === 0 ? "\nR3-1: ALL PASS (no break)" : `\nR3-1: ${fails} BREAK(S)`);
process.exit(0);
