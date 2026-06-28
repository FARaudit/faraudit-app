// $0 gate for the ORCHESTRATOR (Brain card 43, build #4). Proves the full P0→P5 agentic cycle — manifest,
// parallel experts, dedup, conflict, coverage, deterministic decision — with STUB experts ($0, no API).
import { runAgenticAudit, completenessOf } from "@/lib/audit-orchestrator";
import { type CallModel, type RawFinding } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

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

// STATELESS stub — same contract as makeAnthropicCallModel: first turn READS (B-corrected requires every
// binding section be tool-pulled), thereafter submits the finding set keyed by the expert's system prompt.
const ALL = ["B", "C", "I", "L", "M"];
const stubFor = (sets: Record<string, RawFinding[]>, reads: string[] = ALL): CallModel =>
  async ({ system, priorToolResults }) =>
    priorToolResults.length === 0
      ? { toolCalls: reads.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
      : { toolCalls: [], findings: sets[system] ?? [] };

const experts = [{ key: "capture", system: "LENS_A" }, { key: "ko", system: "LENS_B" }];

async function main() {
  // ── Happy path: both lenses READ all 5 binding sections; jointly ground them; cab duplicated → dedup. ──
  const res = await runAgenticAudit({ ctx, experts, callModel: stubFor({ LENS_A: [F.price, F.cab, F.setA], LENS_B: [F.cab, F.coc, F.eval] }) });
  ok("P0 manifest = all binding sections present", res.coverage.required.slice().sort(), ["B", "C", "I", "L", "M"]);
  ok("P4 nothing missing", res.coverage.missing, []);
  ok("P3 dedup → cab counted once (5 unique findings)", res.findings.length, 5);
  ok("P5 verdict = BID", res.decision.verdict, "BID");
  ok("coverageComplete true", res.inputs.coverageComplete, true);
  ok("per-lens counts reported", [res.perLens.capture, res.perLens.ko], [3, 3]);
  ok("trace records 5 sections read", res.sectionsRead.slice().sort(), ["B", "C", "I", "L", "M"]);
  ok("findings carry stable IDs", res.findings.every((f) => !!f.id), true);

  // ── B-corrected read-gate: a binding section NEVER READ → unread → INCOMPLETE (honest fail). ──
  const resInc = await runAgenticAudit({ ctx, experts, callModel: stubFor({ LENS_A: [F.price, F.cab, F.setA], LENS_B: [F.coc] }, ["B", "C", "I", "L"]) });
  ok("unread §M flagged missing", resInc.coverage.missing, ["M"]);
  ok("§M attestation = unread", resInc.coverage.attestations.find((a) => a.section === "M")?.status, "unread");
  ok("unread section → INCOMPLETE", resInc.decision.verdict, "INCOMPLETE");

  // ── Conflict: same requirement cannot_move vs already_satisfied → NEEDS_HUMAN_REVIEW. ──
  const clash: RawFinding = { requirement: "small-business set-aside (firm qualifies)", citation: "§I", excerpt: "Notice of Total Small Business Set-Aside", kind: "eligibility_bar", controllability: "bidder_cannot_move" };
  const resConf = await runAgenticAudit({ ctx, experts, callModel: stubFor({ LENS_A: [F.price, F.cab, F.setA, F.coc, F.eval], LENS_B: [clash] }) });
  ok("P3 conflict detected", resConf.conflict, true);
  ok("conflict → NEEDS_HUMAN_REVIEW", resConf.decision.verdict, "NEEDS_HUMAN_REVIEW");

  // ── B-corrected obligation-coverage (the §C scenario), tested directly on completenessOf. ──
  // §C carries an obligation ("shall furnish ... fully enclosed cab"); no DIRECT §C finding, but another
  // lane's finding shares a ≥4-word verbatim n-gram with it → covered_attested, citing that finding ID.
  // excerpt shares the 4-gram "contractor shall furnish one" with §C's obligation but is NOT a substring of
  // §C (it ends differently) → so it grounds the obligation by n-gram (attested), not by location (direct).
  const attestFinding: TypedFinding = { id: "proposal#0", requirement: "machine brochure", citation: "§L", excerpt: "the contractor shall furnish one mini-excavator per the attached brochure submission instructions", grounded: true, lens: "proposal", kind: "submission", controllability: "bidder_controls" };
  const compAtt = completenessOf(ctx, ["C"], [attestFinding], new Set(["C"]));
  ok("§C read + obligation grounded elsewhere → covered_attested", compAtt.attestations[0].status, "covered_attested");
  ok("§C attestation CITES the grounding finding id", compAtt.attestations[0].citedFindingIds, ["proposal#0"]);
  ok("§C attested → not missing", compAtt.missing, []);

  // read + obligation + NOTHING grounds it → obligations_ungrounded → missing (silence ≠ coverage).
  const compUng = completenessOf(ctx, ["C"], [], new Set(["C"]));
  ok("§C read but obligation ungrounded → missing", compUng.missing, ["C"]);
  ok("§C status = obligations_ungrounded", compUng.attestations[0].status, "obligations_ungrounded");

  console.log(`orchestrator gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
  console.log("✅ ALL PASS — full P0→P5 cycle: manifest · parallel experts · dedup · conflict · coverage · DERIVED verdict.");
}

main();
