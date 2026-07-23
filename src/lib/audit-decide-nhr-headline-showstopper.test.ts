// REPAIR UNIT item A (card #703, Tier V · flag AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST, default-OFF).
// Run: npx tsx src/lib/audit-decide-nhr-headline-showstopper.test.ts
//
// DEFECT (FA813726R0033, first live run): the coverage-NHR cap headlined an ungrounded §L reps-&-certs recital
// (disqualifierUncovered content, hijacked by an OCR garble) while the DECISIVE grounded gate — BOA-holders-only —
// sat unreferenced in showStoppers[]. Item A: when the cap fires AND a grounded eligibility show-stopper exists,
// LEAD the reason with the grounded bar and DEMOTE the uncovered-obligation reason. HEADLINE SELECTION ONLY —
// the cap/pole are unchanged (still NHR); flag-OFF ⇒ byte-identical.
export {}; // MODULE scope — env set before the dynamic import.
process.env.AUDIT_GATE_V2 = "true";
type TypedFinding = import("./audit-findings").TypedFinding;
type VerdictInputs = import("./audit-findings").VerdictInputs;

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

async function main() {
  const { deriveVerdict } = await import("./audit-decide");

  const REPS = "The offeror shall provide a statement the offeror has completed the annual representations and certification electronica";
  const BOA = "This order proposal request is ONLY available to current BOA holders.";
  const src = `${BOA} Estimated magnitude of construction: $500,000 to $1,000,000.`;

  // Coverage cap fires on the ungrounded reps recital (the hijacked headline).
  const covNHR = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [{ section: "L", obligation: REPS }], coverageGrade: 0.9 };
  // A GROUNDED BOA-holders-only eligibility bar — the real decisive gate.
  const boaBar = (): TypedFinding => ({
    requirement: BOA, citation: "SF 1442 / OPR cover page", excerpt: BOA, kind: "eligibility_bar",
    controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko", severity: "P0",
    requiredAttribute: "boa_holder", curableInWindow: false,
  });
  const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: src } as const;
  const mk = (over: Partial<VerdictInputs> = {}): VerdictInputs =>
    ({ findings: [boaBar()], ...base, coverageV2: covNHR, ...over } as VerdictInputs);

  const setFlags = (headline: boolean, fill: boolean) => {
    if (headline) process.env.AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST = "true"; else delete process.env.AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST;
    if (fill) process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL = "true"; else delete process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL;
  };

  console.log("\n── 1 · FLAG-OFF (fill ON) — today's behavior: headline is the ungrounded recital ──");
  setFlags(false, true);
  const off = deriveVerdict(mk());
  assert(off.verdict === "NEEDS_HUMAN_REVIEW", `flag-OFF ⇒ NHR (got ${off.verdict})`);
  assert(/could not be grounded/i.test(off.reason), "flag-OFF ⇒ reason still states the ungrounded obligation (recital headline)");
  assert(!/only your firm can confirm/i.test(off.reason), "flag-OFF ⇒ reason does NOT lead with the grounded bar");

  console.log("\n── 2 · FLAG-ON — headline LEADS with the grounded BOA gate, recital demoted ──");
  setFlags(true, true);
  const on = deriveVerdict(mk());
  assert(on.verdict === "NEEDS_HUMAN_REVIEW", `flag-ON ⇒ verdict UNCHANGED, still NHR (got ${on.verdict})`);
  assert(/only your firm can confirm are cleared/i.test(on.reason), "flag-ON ⇒ reason LEADS with the grounded eligibility bar (namedEligibilityReason)");
  assert(/BOA holders/i.test(on.reason), "flag-ON ⇒ the BOA-holders-only gate is named in the headline");
  assert(/secondary coverage note/i.test(on.reason) && /could not be grounded/i.test(on.reason), "flag-ON ⇒ the ungrounded-obligation reason is DEMOTED to a secondary note (not dropped)");
  assert(on.reason.indexOf("BOA") < on.reason.indexOf("could not be grounded"), "flag-ON ⇒ the grounded gate PRECEDES the coverage note in reading order");

  console.log("\n── 3 · BYTE-IDENTITY — flag-OFF reason is verbatim the no-flag reason ──");
  delete process.env.AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST; // fully absent
  process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL = "true";
  const noFlag = deriveVerdict(mk());
  assert(noFlag.reason === off.reason, "flag-absent reason === flag-OFF reason (byte-identical)");

  console.log("\n── 4 · NO-STOPPER GUARD — cap with no grounded eligibility bar ⇒ flag-ON is inert (recital headline stands) ──");
  setFlags(true, true);
  const noBar = deriveVerdict(mk({ findings: [{ requirement: "Offeror shall submit a technical approach.", citation: "§L.3", excerpt: "shall submit a technical approach", kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "proposal_manager", curableInWindow: true } as TypedFinding] }));
  assert(noBar.verdict === "NEEDS_HUMAN_REVIEW", `no-bar ⇒ still NHR (got ${noBar.verdict})`);
  assert(!/only your firm can confirm/i.test(noBar.reason) && /could not be grounded/i.test(noBar.reason), "no grounded bar ⇒ flag-ON does not fabricate a lead; recital headline stands");

  console.log(`\n${failures === 0 ? "🟢 DRY — item A (NHR headline show-stopper first) PASSES" : `❌ ${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
