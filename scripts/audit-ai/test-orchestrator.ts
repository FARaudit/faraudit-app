// $0 gate for the ORCHESTRATOR (Brain card 43, build #4). Proves the full P0→P5 agentic cycle — manifest,
// parallel experts, dedup, conflict, coverage, deterministic decision — with STUB experts ($0, no API).
import { runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel, type RawFinding } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";

const SRC = [
  "SECTION B - SUPPLIES AND PRICES",
  "Offerors shall submit pricing for all CLINs 0001 through 0005.",
  "SECTION C - STATEMENT OF WORK",
  "The contractor shall furnish one mini-excavator with a fully enclosed cab.",
  "SECTION I - CONTRACT CLAUSES",
  "52.219-6 Notice of Total Small Business Set-Aside is incorporated.",
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS",
  "Award will be made on a Lowest-Priced Technically Acceptable basis.",
].join("\n");
const ctx: AuditToolContext = { fullSource: SRC };

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

const F = {
  price: { requirement: "submit pricing for all CLINs", citation: "§B", excerpt: "pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" },
  cab:   { requirement: "enclosed cab", citation: "§C", excerpt: "fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" },
  setA:  { requirement: "small-business set-aside (firm qualifies)", citation: "§I", excerpt: "52.219-6", kind: "eligibility_bar", controllability: "already_satisfied" },
  coc:   { requirement: "Certificate of Conformance", citation: "§L", excerpt: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" },
  eval:  { requirement: "LPTA evaluation", citation: "§M", excerpt: "Lowest-Priced Technically Acceptable", kind: "other", controllability: "bidder_controls" },
} as Record<string, RawFinding>;

// STATELESS stub — same contract as the real makeAnthropicCallModel: first turn (no prior results) reads;
// thereafter it submits the finding set keyed by the expert's system prompt. Safe under Promise.all interleave.
const stubFor = (sets: Record<string, RawFinding[]>): CallModel =>
  async ({ system, priorToolResults }) =>
    priorToolResults.length === 0
      ? { toolCalls: [{ id: "r", name: "read_section", input: { key: "C" } }], findings: null }
      : { toolCalls: [], findings: sets[system] ?? [] };

const experts = [{ key: "capture", system: "LENS_A" }, { key: "ko", system: "LENS_B" }];

async function main() {
  // ── Happy path: two lenses jointly cover all 5 binding sections; the cab finding is duplicated → dedup. ──
  const res = await runAgenticAudit({ ctx, experts, callModel: stubFor({ LENS_A: [F.price, F.cab, F.setA], LENS_B: [F.cab, F.coc, F.eval] }) });
  ok("P0 manifest = all binding sections present", res.coverage.required.slice().sort(), ["B", "C", "I", "L", "M"]);
  ok("P4 nothing missing", res.coverage.missing, []);
  ok("P3 dedup → cab counted once (5 unique findings)", res.findings.length, 5);
  ok("P5 verdict = BID", res.decision.verdict, "BID");
  ok("coverageComplete true", res.inputs.coverageComplete, true);
  ok("per-lens counts reported", [res.perLens.capture, res.perLens.ko], [3, 3]);

  // ── Incomplete: §M never grounded → uncovered → INCOMPLETE (honest fail, no false green). ──
  const resInc = await runAgenticAudit({ ctx, experts, callModel: stubFor({ LENS_A: [F.price, F.cab, F.setA], LENS_B: [F.coc] }) });
  ok("missing §M flagged", resInc.coverage.missing, ["M"]);
  ok("incomplete coverage → INCOMPLETE", resInc.decision.verdict, "INCOMPLETE");

  // ── Conflict: same requirement asserted cannot_move vs already_satisfied → NEEDS_HUMAN_REVIEW. ──
  const clash: RawFinding = { requirement: "small-business set-aside (firm qualifies)", citation: "§I", excerpt: "Notice of Total Small Business Set-Aside", kind: "eligibility_bar", controllability: "bidder_cannot_move" };
  const resConf = await runAgenticAudit({ ctx, experts, callModel: stubFor({ LENS_A: [F.price, F.cab, F.setA, F.coc, F.eval], LENS_B: [clash] }) });
  ok("P3 conflict detected", resConf.conflict, true);
  ok("conflict → NEEDS_HUMAN_REVIEW", resConf.decision.verdict, "NEEDS_HUMAN_REVIEW");

  console.log(`orchestrator gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
  console.log("✅ ALL PASS — full P0→P5 cycle: manifest · parallel experts · dedup · conflict · coverage · DERIVED verdict.");
}

main();
