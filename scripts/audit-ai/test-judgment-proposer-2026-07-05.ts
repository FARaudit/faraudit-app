// $0 gate for the real holistic PROPOSER (makeJudgmentFirstProposer), model call STUBBED. Proves: the whole
// source + profile context reach the model; the structured output is parsed into a ProposedJudgment; findings are
// stamped grounded:false/lens (the proposer NEVER self-asserts grounding — the rail's substring check owns that);
// and a truncated/unparseable/invalid response THROWS (no silent partial — honest-fail).
import { makeJudgmentFirstProposer, runJudgmentFirst, JUDGMENT_FIRST_SCHEMA, type JudgmentStructuredCaller, type JudgmentFirstInput } from "@/lib/audit-judgment-first";
import type { Decision, Verdict } from "@/lib/audit-decide";
import type { BidderProfile } from "@/lib/audit-findings";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

const VALID = JSON.stringify({
  verdict: "BID_WITH_CAUTION", eligible: true, analysis: "Boardroom analysis: biddable, one caution.", reason: "open + one curable caution",
  findings: [{ requirement: "enclosed cab", citation: "§C", excerpt: "the item shall have a fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" }],
});
// A stub structured caller that records what it was asked and returns a canned response.
const stub = (text: string, stopReason: string | null = "end_turn"): { caller: JudgmentStructuredCaller; seen: { system?: string; user?: string; schema?: unknown } } => {
  const seen: { system?: string; user?: string; schema?: unknown } = {};
  const caller: JudgmentStructuredCaller = async (args) => { seen.system = args.system; seen.user = args.user; seen.schema = args.schema; return { text, stopReason }; };
  return { caller, seen };
};

async function main() {
  const input: JudgmentFirstInput = { fullSource: "SECTION C\nThe item shall have a fully enclosed cab.\nSECTION L\nProposals shall not exceed 40 pages.", bidderProfile: null, naics: "336120", setAside: "SBA" };

  console.log("proposer — context assembly + parse");
  const { caller, seen } = stub(VALID);
  const proposed = await makeJudgmentFirstProposer(caller, "claude-test")(input);
  check("the WHOLE source is sent to the model", (seen.user ?? "").includes("fully enclosed cab") && (seen.user ?? "").includes("FULL SOLICITATION SOURCE"));
  check("null profile → open-world instruction (no inference from silence)", (seen.user ?? "").includes("open-world") && (seen.user ?? "").includes("do NOT infer ineligibility"));
  check("solicitation facts (NAICS/set-aside) passed", (seen.user ?? "").includes("336120") && (seen.user ?? "").includes("SBA"));
  check("strict schema handed to the caller", seen.schema === JUDGMENT_FIRST_SCHEMA);
  check("verdict parsed", proposed.verdict === "BID_WITH_CAUTION");
  check("analysis parsed (the boardroom product surface)", proposed.analysis.startsWith("Boardroom analysis"));
  check("findings parsed + stamped grounded:false (rail owns grounding, not the proposer) + lens", proposed.findings.length === 1 && proposed.findings[0].grounded === false && proposed.findings[0].lens === "judgment");

  console.log("\nproposer — fail-safe (no silent partial)");
  check("truncated (max_tokens) response → THROWS", await throws(() => makeJudgmentFirstProposer(stub(VALID, "max_tokens").caller, "m")(input)));
  check("unparseable response → THROWS", await throws(() => makeJudgmentFirstProposer(stub("not json").caller, "m")(input)));
  check("missing/invalid verdict → THROWS", await throws(() => makeJudgmentFirstProposer(stub(JSON.stringify({ analysis: "x", reason: "y", findings: [] })).caller, "m")(input)));

  console.log("\nproposer → rail → DISPOSE end-to-end (rail stubbed)");
  // proposer says BID_WITH_CAUTION; rail (stub) independently derives NEEDS_HUMAN_REVIEW → DISPOSE gates to NHR.
  const railNHR = (): Decision => ({ verdict: "NEEDS_HUMAN_REVIEW" as Verdict, eligible: null, reason: "rail nhr", dispositions: [], showStoppers: [] });
  const r = await runJudgmentFirst(input, makeJudgmentFirstProposer(stub(VALID).caller, "m"), railNHR);
  check("proposer CAUTION + rail NHR → disposed NHR (rail gates the real proposal)", r.disposed.verdict === "NEEDS_HUMAN_REVIEW");
  check("proposer's boardroom analysis still carried through on a downgrade", r.analysis.startsWith("Boardroom analysis"));

  const closed: BidderProfile = { satisfiedAttributes: ["clearance:secret"], closedWorld: true };
  const cw = stub(VALID);
  await makeJudgmentFirstProposer(cw.caller, "m")({ ...input, bidderProfile: closed });
  check("closed-world profile → attributes + closed-world note reach the model", (cw.seen.user ?? "").includes("clearance:secret") && (cw.seen.user ?? "").includes("closed-world"));

  console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
