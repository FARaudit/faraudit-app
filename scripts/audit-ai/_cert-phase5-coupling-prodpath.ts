// GATE-1 $0 PROOF (production composition) — Phase 5 passive/noun-frame eligibility-bar floor + demotion COUPLING.
// Drives the REAL completenessOf() + gradeCoverageV2() (no stubs), with the TRUE PROD QUARTET armed (self-cert demotion
// flags ON in prod, so a cert with them OFF proves nothing). Proves the card #560 BINDING requirement — not just flag-OFF
// byte-identity, but that the passive match routes through the SAME demotion/escalation authority as ELIGIBILITY_BAR_RE:
//  (A) BREAK: passive flag ON → a §H passive "TS/SCI clearance IS REQUIRED" bar (ELIGIBILITY_BAR_RE MISSES it) co-resident
//      with a benign grounded finding → obligations_ungrounded (the catastrophic false-COMPLETE, now surfaced).
//  (B) PHASE-4 BYTE-IDENTITY: passive flag OFF (covered_direct floor still ON) → §H covered_direct — the passive scan
//      never runs, so Phase 5 is byte-identical to Phase 4 (which MISSES this bar). Isolates Phase 5's effect exactly.
//  (C) CLEAN: passive ON, §H benign-only → covered_direct (ZERO over-fire by construction).
//  (D) GROUNDED: passive ON, the passive bar IS grounded by an overlapping finding → covered_direct (analyzed, not floored).
//  (E) SAME EMISSION CHANNEL: gradeCoverageV2 over the flag-ON attestations → disqualifierUncovered (escalation reaches
//      importanceOf — the passive bar rides the IDENTICAL channel as an ELIGIBILITY_BAR_RE bar).
//  (F) COUPLING — SELF-CERT CANNOT LAUNDER: a passive bar COUPLED to a self-cert token ("registered in SAM AND an
//      authorized reseller of the OEM") → STILL floors. The self-cert demotion authority is CONSULTED and correctly
//      REFUSES to demote (TEST-4 residual content) → escalate. This is the property the binding protects.
//  (G) COUPLING — pure self-cert UNAFFECTED: a pure SAM self-cert sentence with NO passive credential noun → the passive
//      scan never claims it (no noun) and the existing self-cert demotion still demotes it → covered_direct. Phase 5 does
//      not perturb the ratified self-cert path.
//  (H) SUPPLY-CHAIN over-fire guard: a GOOD "installed by an authorized dealer" (workmanship) → covered_direct (SKIP).
//  (I) SCOPE: §L (per-obligation) is never routed through the floor.
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";     // the covered_direct floor is the wiring point (card #560 :1557 FIRST)
import { completenessOf, passiveFrameEligBarSentence } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`❌ ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const withPassive = (on: boolean, fn: () => void) => { const prev = process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME; process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME = on ? "true" : "false"; try { fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME; else process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME = prev; } };

const BENIGN = "Government-furnished property will be provided at the contractor's facility during performance.";
const PASSIVE_BAR = "A current TS/SCI clearance is required for all personnel prior to performance.";
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: o.id ?? "f", citation: o.citation ?? "§H", excerpt: o.excerpt ?? BENIGN, kind: o.kind ?? "requirement", controllability: o.controllability ?? "bidder_controls", severity: o.severity ?? "info" } as unknown as TypedFinding);
const benign = F({ id: "f_benign", excerpt: BENIGN });
const H = (bar: string) => ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, bar].join("\n");

function main() {
  // (A) BREAK — passive ON, ungrounded passive clearance bar next to a benign grounded finding.
  withPassive(true, () => {
    const r = completenessOf({ fullSource: H(PASSIVE_BAR) } as any, ["H"], [benign], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(A) passive ON ⇒ §H obligations_ungrounded (passive TS/SCI bar surfaced)", h?.status, "obligations_ungrounded");
    ok("(A) §H missing", r.missing, ["H"]);
    ok("(A) reason is the REAL passive bar sentence", h?.ungrounded.some((u) => /ts\/sci clearance is required/i.test(u)), true);
    ok("(A) NOT the benign sentence", h?.ungrounded.some((u) => /government-furnished/i.test(u)), false);
  });
  // (B) PHASE-4 BYTE-IDENTITY — passive OFF, same input → covered_direct (Phase 4 misses the passive bar).
  withPassive(false, () => {
    const r = completenessOf({ fullSource: H(PASSIVE_BAR) } as any, ["H"], [benign], new Set(["H"]));
    ok("(B) passive OFF ⇒ §H covered_direct (Phase-4 byte-identical; ELIGIBILITY_BAR_RE misses it)", r.attestations.find((a) => a.section === "H")?.status, "covered_direct");
  });
  // (C) CLEAN — passive ON, no bar → covered_direct (zero over-fire).
  withPassive(true, () => {
    const r = completenessOf({ fullSource: ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN].join("\n") } as any, ["H"], [benign], new Set(["H"]));
    ok("(C) clean §H (no bar) ⇒ covered_direct even passive ON (zero over-fire)", r.attestations.find((a) => a.section === "H")?.status, "covered_direct");
  });
  // (D) GROUNDED — passive ON, the bar IS grounded by an overlapping finding → covered_direct.
  withPassive(true, () => {
    const r = completenessOf({ fullSource: H(PASSIVE_BAR) } as any, ["H"], [benign, F({ id: "f_bar", excerpt: PASSIVE_BAR, controllability: "bidder_cannot_move", severity: "critical" })], new Set(["H"]));
    ok("(D) grounded passive bar ⇒ covered_direct (an analyzed bar is never floored)", r.attestations.find((a) => a.section === "H")?.status, "covered_direct");
  });
  // (E) SAME EMISSION CHANNEL — gradeCoverageV2 escalates via importanceOf, identical to an ELIGIBILITY_BAR_RE bar.
  withPassive(true, () => {
    const r = completenessOf({ fullSource: H(PASSIVE_BAR) } as any, ["H"], [benign], new Set(["H"]));
    const cov = gradeCoverageV2(r.attestations);
    ok("(E) V2: passive bar reaches disqualifierUncovered (escalation, not silent-BID)", cov.disqualifierUncovered.some((d) => /ts\/sci clearance is required/i.test(d.obligation)), true);
    ok("(E) V2: §H NOT counted covered", cov.coverageGrade < 1, true);
  });
  // (F) COUPLING — self-cert CANNOT launder a coupled passive bar.
  const COUPLED = "Offerors must be registered in SAM and must be an authorized reseller of the OEM.";
  ok("(F-unit) passiveFrameEligBarSentence FLAGS the coupled bar (self-cert refuses to demote)", passiveFrameEligBarSentence(COUPLED), true);
  withPassive(true, () => {
    const r = completenessOf({ fullSource: ["SECTION C - DESCRIPTION/SPECS", "The work consists of routine maintenance.", COUPLED].join("\n") } as any, ["C"], [F({ id: "fc", citation: "§C", excerpt: "The work consists of routine maintenance." })], new Set(["C"]));
    ok("(F) coupled 'SAM + authorized reseller' ⇒ floors (self-cert cannot launder)", r.attestations.find((a) => a.section === "C")?.status, "obligations_ungrounded");
  });
  // (G) COUPLING — a PURE SAM self-cert with NO passive noun is unaffected (still demotes → covered_direct).
  const PURE_SELFCERT = "Offerors must be registered in SAM (FAR 52.204-7) to be eligible for award.";
  ok("(G-unit) passiveFrameEligBarSentence does NOT claim a pure self-cert (no credential noun)", passiveFrameEligBarSentence(PURE_SELFCERT), false);
  withPassive(true, () => {
    const r = completenessOf({ fullSource: ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, PURE_SELFCERT].join("\n") } as any, ["H"], [benign], new Set(["H"]));
    ok("(G) pure SAM self-cert ⇒ covered_direct (ratified self-cert path unperturbed)", r.attestations.find((a) => a.section === "H")?.status, "covered_direct");
  });
  // (H) SUPPLY-CHAIN over-fire guard — a GOOD installed BY an authorized dealer (workmanship) → SKIP.
  const WORKMANSHIP = "When required by the manufacturer, folding panel partitions must be installed by an authorized dealer with a certified crew.";
  ok("(H-unit) passiveFrameEligBarSentence SKIPS goods-installed-by-dealer workmanship", passiveFrameEligBarSentence(WORKMANSHIP), false);
  withPassive(true, () => {
    const r = completenessOf({ fullSource: ["SECTION C - DESCRIPTION/SPECS", "The work consists of routine maintenance.", WORKMANSHIP].join("\n") } as any, ["C"], [F({ id: "fc2", citation: "§C", excerpt: "The work consists of routine maintenance." })], new Set(["C"]));
    ok("(H) goods installed-by-dealer ⇒ covered_direct (workmanship, not a bidder bar)", r.attestations.find((a) => a.section === "C")?.status, "covered_direct");
  });
  // (I) SCOPE — §L never routes through the covered_direct floor.
  withPassive(true, () => {
    const r = completenessOf({ fullSource: ["SECTION L - INSTRUCTIONS", "Offerors shall submit a technical volume.", PASSIVE_BAR].join("\n") } as any, ["L"], [F({ id: "fl", citation: "§L", excerpt: "Offerors shall submit a technical volume." })], new Set(["L"]));
    ok("(I) §L never routes through the floor (per-obligation owns it)", r.attestations.find((a) => a.section === "L")?.status !== "covered_direct", true);
  });

  console.log(`\n${fails.length === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} assertions passed, ${fails.length} failed`);
  fails.forEach((f) => console.log(f));
  if (fails.length) process.exit(1);
}
main();
