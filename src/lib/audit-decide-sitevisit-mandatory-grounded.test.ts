// REPAIR UNIT item B (card #703, Tier V · flag AUDIT_SITEVISIT_MANDATORY_GROUNDED, default-OFF).
// Run: npx tsx src/lib/audit-decide-sitevisit-mandatory-grounded.test.ts
//
// DEFECT (FA813726R0033, first live run): the concluded-site-visit finding carried a `disqualifying` disposition
// ("Mandatory site visit … BARS AWARD unless attendance confirmed") that its own grounded EXCERPT does not support —
// the excerpt only says "site visit was held and concluded on may 28". The bar-status was inferred from the
// model-generated requirement, not grounded. Item B: a concluded site visit promotes to a P0 disqualifying
// show-stopper ONLY if mandatory-attendance-as-precondition is grounded in the verbatim EXCERPT; else it is an
// attribute/caveat (demoted out of the show-stopper band). Flag-OFF ⇒ byte-identical.
export {}; // MODULE scope — env set before the dynamic import.
process.env.AUDIT_GATE_V2 = "true";
process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL = "true"; // route grounded stoppers into showStoppers[] (the live path)
type TypedFinding = import("./audit-findings").TypedFinding;
type VerdictInputs = import("./audit-findings").VerdictInputs;

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

async function main() {
  const { deriveVerdict } = await import("./audit-decide");

  // FA813726R0033 regression pin — concluded, NO grounded mandatory-attendance in the excerpt.
  const CONCLUDED_EXCERPT = "update 01 - may 28, 2026 1) site visit was held and concluded on may 28, 2026.";
  const concludedSiteVisit = (): TypedFinding => ({
    requirement: "Mandatory site visit stated in the SAM notice body was held/concluded may 28, 2026; attendance is non-retroactive — this BARS AWARD unless the firm's attendance at the concluded site visit is confirmed.",
    citation: "SAM Notice Body", excerpt: CONCLUDED_EXCERPT, kind: "eligibility_bar",
    controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko", severity: "P0",
    requiredAttribute: "site_visit_attendance", curableInWindow: false,
  });
  // A GENUINE mandatory site visit — the excerpt itself grounds attendance-as-precondition (must still promote).
  const MANDATORY_EXCERPT = "A mandatory site visit will be held; attendance is required and firms that fail to attend will be ineligible for award. The site visit was held and concluded on may 28, 2026.";
  const mandatorySiteVisit = (): TypedFinding => ({ ...concludedSiteVisit(), excerpt: MANDATORY_EXCERPT });

  const covNHR = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [{ section: "L", obligation: "Some ungrounded §L obligation." }], coverageGrade: 0.9 };
  const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: CONCLUDED_EXCERPT } as const;
  const mk = (findings: TypedFinding[], src?: string): VerdictInputs =>
    ({ findings, ...base, source: src ?? CONCLUDED_EXCERPT, coverageV2: covNHR } as VerdictInputs);
  const stopperReqs = (d: { showStoppers?: Array<{ requirement?: string }> }) => (d.showStoppers ?? []).map((s) => s.requirement ?? "");
  const hasSiteVisitStopper = (d: any) => stopperReqs(d).some((r) => /site visit/i.test(r));

  console.log("\n── 1 · FLAG-OFF — concluded site visit PROMOTES to a show-stopper (today's behavior) ──");
  delete process.env.AUDIT_SITEVISIT_MANDATORY_GROUNDED;
  const off = deriveVerdict(mk([concludedSiteVisit()]));
  assert(off.verdict === "NEEDS_HUMAN_REVIEW", `flag-OFF ⇒ NHR (got ${off.verdict})`);
  assert(hasSiteVisitStopper(off), "flag-OFF ⇒ the concluded site-visit bar IS a show-stopper (the over-claim, today)");

  console.log("\n── 2 · FLAG-ON — concluded site visit WITHOUT grounded mandatory-attendance is DEMOTED ──");
  process.env.AUDIT_SITEVISIT_MANDATORY_GROUNDED = "true";
  const on = deriveVerdict(mk([concludedSiteVisit()]));
  assert(on.verdict === "NEEDS_HUMAN_REVIEW", `flag-ON ⇒ verdict UNCHANGED, still NHR (got ${on.verdict})`);
  assert(!hasSiteVisitStopper(on), "flag-ON ⇒ concluded site visit (excerpt grounds only 'held and concluded') is NOT a disqualifying show-stopper — attribute/caveat");

  console.log("\n── 3 · FLAG-ON — a GENUINE mandatory site visit (excerpt grounds attendance-as-precondition) STILL promotes ──");
  const onMandatory = deriveVerdict(mk([mandatorySiteVisit()], MANDATORY_EXCERPT));
  assert(hasSiteVisitStopper(onMandatory), "flag-ON ⇒ grounded mandatory-attendance still promotes to a show-stopper (no over-demotion)");

  console.log("\n── 4 · BYTE-IDENTITY — flag-OFF showStoppers === flag-absent showStoppers ──");
  delete process.env.AUDIT_SITEVISIT_MANDATORY_GROUNDED;
  const noFlag = deriveVerdict(mk([concludedSiteVisit()]));
  assert(JSON.stringify(stopperReqs(noFlag)) === JSON.stringify(stopperReqs(off)), "flag-absent === flag-OFF (byte-identical show-stopper set)");

  console.log(`\n${failures === 0 ? "🟢 DRY — item B (site-visit mandatory-grounded) PASSES" : `❌ ${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
