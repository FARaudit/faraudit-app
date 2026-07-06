// $0 gate for the JUDGMENT-FIRST SEED SEAM in runAgenticAudit (Brain cards 276/279 — the thin adapter's rail).
// Proves the RE-GROUNDING that the proposer's grounded:false depends on:
//   • the LOAD-BEARING NEGATIVE — a seed finding whose excerpt is NOT verbatim in source is re-grounded to
//     grounded:false and DROPPED before the verdict (a hallucinated excerpt can never ride into a decision);
//   • a seed finding stamped grounded:false by the proposer but whose excerpt IS verbatim in source is re-grounded
//     to grounded:true by the rail (the rail OWNS grounding, not the proposer — the fix in audit-judgment-first.ts);
//   • seed mode SKIPS the paid expert lenses (callModel must never fire); ids are assigned (judgment#N);
//   • seedFindings ABSENT ⇒ the ladder path (experts) is byte-identical (the else-branch is untouched).
// STUB everything — no API, $0.
import { runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel, type RawFinding } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

const SRC = [
  "SECTION B - SUPPLIES AND PRICES",
  "Offerors shall submit pricing for all CLINs 0001 through 0005.",
  "SECTION C - STATEMENT OF WORK",
  "The contractor shall furnish one mini-excavator with a fully enclosed cab.",
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS",
  "Award will be made on a Lowest-Priced Technically Acceptable basis.",
].join("\n");
const ctx: AuditToolContext = { fullSource: SRC };

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

// A seed finding as the proposer produces it: grounded:false (never self-asserted), excerpt is a model CLAIM.
const seed = (excerpt: string, extra: Partial<TypedFinding> = {}): TypedFinding => ({
  requirement: "req", citation: "§C", excerpt, kind: "technical_spec", controllability: "bidder_controls",
  grounded: false, lens: "judgment", ...extra,
});

// callModel that BLOWS UP if invoked — in seed mode the lenses must never run (the proposer replaced them).
const explodingCallModel: CallModel = async () => { throw new Error("callModel fired in seed mode — the paid lenses must be skipped"); };

async function main() {
  // ── A. LOAD-BEARING NEGATIVE — a hallucinated excerpt (not verbatim in source) is dropped; a real one survives.
  const real = seed("fully enclosed cab");              // verbatim in §C
  const halluc = seed("flux capacitor certification");  // NOT anywhere in source
  const resA = await runAgenticAudit({ ctx, experts: [], callModel: explodingCallModel, seedFindings: [real, halluc] });
  ok("hallucinated excerpt DROPPED (re-grounded false)", resA.findings.some((f) => f.excerpt === "flux capacitor certification"), false);
  ok("real verbatim excerpt SURVIVES", resA.findings.some((f) => f.excerpt === "fully enclosed cab"), true);
  ok("every surviving seed finding is grounded:true (rail SET it from source)", resA.findings.every((f) => f.grounded === true), true);
  ok("survivor carries a stable judgment id", resA.findings.find((f) => f.excerpt === "fully enclosed cab")?.id, "judgment#0");
  ok("perLens tallies the judgment seed (survivors only)", resA.perLens.judgment, 1);
  ok("a Decision is derived over the seed", typeof resA.decision.verdict === "string", true);

  // ── B. The rail OWNS grounding — a proposer finding stamped grounded:false but verbatim-in-source is re-grounded
  //       to TRUE by the rail (this is exactly what the audit-judgment-first.ts fix relies on).
  const resB = await runAgenticAudit({ ctx, experts: [], callModel: explodingCallModel, seedFindings: [seed("Lowest-Priced Technically Acceptable", { citation: "§M" })] });
  ok("proposer grounded:false + verbatim excerpt → rail re-grounds to TRUE", resB.findings[0]?.grounded, true);

  // ── C. All-hallucinated seed → nothing survives re-grounding → materially-empty → honest-fail (never a false BID).
  const resC = await runAgenticAudit({ ctx, experts: [], callModel: explodingCallModel, seedFindings: [seed("nonexistent clause A"), seed("nonexistent clause B")] });
  ok("all-hallucinated seed → zero judgment survivors", resC.perLens.judgment, 0);
  ok("all-hallucinated seed → NOT a committal BID", ["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "NO_BID", "INELIGIBLE"].includes(resC.decision.verdict), true);

  // ── D. LADDER PATH UNCHANGED — seedFindings ABSENT ⇒ the expert lenses run (else-branch intact, byte-identical).
  const ladderStub: CallModel = async ({ priorToolResults }) =>
    priorToolResults.length === 0
      ? { toolCalls: [{ id: "rC", name: "read_section", input: { key: "C" } }], findings: null }
      : { toolCalls: [], findings: [{ requirement: "cab", citation: "§C", excerpt: "fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" } as RawFinding] };
  const resD = await runAgenticAudit({ ctx, experts: [{ key: "capture", system: "LENS_A" }], callModel: ladderStub });
  ok("ladder path (no seed) → expert findings, id from lens key not judgment", resD.findings[0]?.id, "capture#0");
  ok("ladder path perLens keyed by the lens, no judgment key", resD.perLens.judgment, undefined);
}

main().then(() => {
  console.log(`\njudgment-first seed/rail seam`);
  for (const f of fails) console.log(`  ✗  ${f}`);
  console.log(fails.length === 0 ? `\n✅ ALL GREEN — ${pass} passed, 0 failed` : `\n❌ ${fails.length} FAILED — ${pass} passed`);
  if (fails.length) process.exit(1);
});
