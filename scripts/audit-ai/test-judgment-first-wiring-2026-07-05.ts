// $0 gate for the judgment-first WIRING (Brain cards 276/279): PROPOSE → rail → DISPOSE, both model seams stubbed.
// Proves the sequencing is correct and the rail GATES the proposer — the disposed verdict is committal only on
// proposer↔rail agreement, disagreement → honest-fail, and the boardroom analysis is carried through.
import { runJudgmentFirst, judgmentFirstEnabled, type ProposedJudgment, type JudgmentFirstInput } from "@/lib/audit-judgment-first";
import type { Decision, Verdict } from "@/lib/audit-decide";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };

const finding: TypedFinding = { requirement: "x", citation: "§C", excerpt: "verbatim", grounded: true, lens: "judgment", kind: "technical_spec", controllability: "bidder_controls" };
const proposal = (verdict: Verdict, analysis = "boardroom narrative"): ProposedJudgment => ({ verdict, eligible: verdict === "BID" ? true : null, analysis, reason: `proposed ${verdict}`, findings: [finding] });
const decision = (verdict: Verdict): Decision => ({ verdict, eligible: verdict === "BID" ? true : null, reason: `rail ${verdict}`, dispositions: [], showStoppers: [] });
const input: JudgmentFirstInput = { fullSource: "SECTION C ... the whole solicitation ..." };
const run = (proposedV: Verdict, railV: Verdict) => runJudgmentFirst(input, async () => proposal(proposedV), () => decision(railV));

async function main() {
  console.log("flag");
  check("judgmentFirstEnabled OFF by default", judgmentFirstEnabled({}) === false);
  check("judgmentFirstEnabled ON when set", judgmentFirstEnabled({ AUDIT_JUDGMENT_FIRST: "true" }) === true);

  console.log("\nwiring — rail gates the proposer");
  let r = await run("BID", "BID");
  check("proposer BID + rail BID → disposed BID (confirmed)", r.disposed.verdict === "BID" && r.disposed.outcome === "confirmed");
  check("boardroom analysis carried through", r.analysis === "boardroom narrative");
  check("proposed + railDerived retained for telemetry/proof", r.proposed.verdict === "BID" && r.railDerived.verdict === "BID");

  r = await run("BID", "NEEDS_HUMAN_REVIEW");
  check("proposer BID + rail NHR → disposed NHR (model can't force BID past rail)", r.disposed.verdict === "NEEDS_HUMAN_REVIEW" && r.disposed.outcome === "conflict_nhr");

  r = await run("NO_BID", "NEEDS_HUMAN_REVIEW");
  check("proposer NO_BID (holistic) + rail NHR → disposed NHR (no forced committal)", r.disposed.verdict === "NEEDS_HUMAN_REVIEW");

  r = await run("INELIGIBLE", "NEEDS_HUMAN_REVIEW");
  check("proposer INELIGIBLE from silence + rail NHR → disposed NHR (I8 holds through the wiring)", r.disposed.verdict === "NEEDS_HUMAN_REVIEW");

  r = await run("NO_BID", "NO_BID");
  check("proposer NO_BID + rail NO_BID (four-walls proven) → disposed NO_BID (confirmed)", r.disposed.verdict === "NO_BID" && r.disposed.outcome === "confirmed");

  r = await run("BID", "INCOMPLETE");
  check("rail INCOMPLETE → disposed INCOMPLETE (honest-fail dominates)", r.disposed.verdict === "INCOMPLETE");

  // The rail is CALLED with the proposer's findings (it derives over them, not over lens output).
  let railSawFindings: TypedFinding[] | null = null;
  await runJudgmentFirst(input, async () => proposal("BID"), (findings) => { railSawFindings = findings; return decision("BID"); });
  check("rail is invoked over the PROPOSER's grounded findings", railSawFindings !== null && (railSawFindings as TypedFinding[]).length === 1);

  console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
