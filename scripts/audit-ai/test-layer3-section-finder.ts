// Layer-3 (Brain card 265/267) — grounded section-finder: load-bearing NEGATIVE + completeness-integration test.
//   npx tsx scripts/audit-ai/test-layer3-section-finder.ts   ($0, deterministic — stubbed finder, no model call)
// Proves: (1) the offset-string-match GATE rejects a fabricated/mis-located anchor (a wrong locate can NEVER mint a
// false-COMPLETE — it fails SAFE to INCOMPLETE); (2) a VERIFIED locate augments the sections the completeness proof
// reads, so a body-resident §L/§M that L1 ingested clears from coreMissingFor exactly as the engine does it.
import { verifyAndExtract, runSectionFinder, type SectionFinderCall } from "@/lib/audit-section-finder";
import { coreMissingFor, runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel } from "@/lib/audit-expert";
import { materializeSections, requiresProposalSections, type AuditToolContext } from "@/lib/audit-tools";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}\n      got ${g}\n      want ${w}`); }
};
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// A SOW-only source whose §L/§M live in NARRATIVE prose (no "SECTION L/M" header) — the 80NSSC class after L1
// ingested the notice body. The deterministic detector reads §L/§M ABSENT; only L3 can locate them.
const SRC =
  "STATEMENT OF WORK\nThe contractor shall furnish the Rockland Piston Cylinder System per the specifications herein.\n" +
  "The offeror shall submit a technical approach describing the proposed solution and a separately priced schedule no later than the response date.\n" +
  "The Government will evaluate quotes on a lowest-price technically-acceptable basis; a quote that fails any salient characteristic will be found technically unacceptable.";
// Verbatim anchors copied EXACTLY from SRC (what an honest finder returns).
const ANCHOR_L = "The offeror shall submit a technical approach describing the proposed solution";
const ANCHOR_M = "The Government will evaluate quotes on a lowest-price technically-acceptable basis";
const ANCHOR_C = "The contractor shall furnish the Rockland Piston Cylinder System per the specifications";
// A fabricated anchor NOT present anywhere in SRC (what a hallucinating finder returns).
const ANCHOR_FAKE = "Award will be made to the lowest responsible bidder meeting the mandatory CMMC Level 3 requirement";

async function main() {
  console.log("── THE GATE (verifyAndExtract): a locate is trusted ONLY if the anchor string-matches verbatim ──");
  ok("verbatim anchor present → extracts text", (verifyAndExtract(SRC, ANCHOR_L) ?? "").includes("technical approach"));
  eq("fabricated anchor (not in source) → REJECTED (null)", verifyAndExtract(SRC, ANCHOR_FAKE), null);
  eq("too-short anchor (< 24 non-ws) → REJECTED (null)", verifyAndExtract(SRC, "evaluate"), null);
  ok("whitespace-insensitive match (collapsed spaces) → extracts", verifyAndExtract(SRC, "The   offeror  shall   submit a technical approach describing the proposed solution") !== null);
  ok("extracted text is VERBATIM source, never model prose", (verifyAndExtract(SRC, ANCHOR_M) ?? "").startsWith("The Government will evaluate quotes"));

  console.log("── runSectionFinder: per-key locate/reject audit trail (never silent) ──");
  const honest: SectionFinderCall = async ({ sectionKey }) =>
    ({ C: { located: true, anchor: ANCHOR_C }, L: { located: true, anchor: ANCHOR_L }, M: { located: true, anchor: ANCHOR_M } }[sectionKey] ?? { located: false, anchor: null });
  const r1 = await runSectionFinder({ fullSource: SRC, targetKeys: ["C", "L", "M"], finder: honest });
  eq("honest finder → all three located", Object.keys(r1.located).sort(), ["C", "L", "M"]);
  ok("attempts record located+verified", r1.attempts.every((a) => a.located && !a.rejected));

  console.log("── LOAD-BEARING NEGATIVE: a fabricated anchor is REJECTED (fail-safe), never accepted ──");
  const liar: SectionFinderCall = async () => ({ located: true, anchor: ANCHOR_FAKE });
  const r2 = await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: liar });
  eq("fabricated-anchor finder → ZERO located", Object.keys(r2.located), []);
  ok("both attempts flagged rejected (fail-safe INCOMPLETE)", r2.attempts.length === 2 && r2.attempts.every((a) => a.rejected && !a.located));

  const notFound: SectionFinderCall = async () => ({ located: false, anchor: null });
  eq("honest not-located finder → ZERO located (INCOMPLETE)", Object.keys((await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: notFound })).located), []);
  const thrower: SectionFinderCall = async () => { throw new Error("model timeout"); };
  const r3 = await runSectionFinder({ fullSource: SRC, targetKeys: ["L"], finder: thrower });
  eq("finder error → caught, ZERO located (fail-safe, never thrown)", Object.keys(r3.located), []);
  ok("finder error is logged in the attempt trail", r3.attempts[0]?.reason.includes("finder error"));

  eq("non-UCF keys (52.212-1) are filtered out (clause-presence is separate)", Object.keys((await runSectionFinder({ fullSource: SRC, targetKeys: ["52.212-1", "52.212-2"], finder: honest })).located), []);

  console.log("── COMPLETENESS INTEGRATION: verified locate CLEARS coreMissingFor; rejected locate does NOT ──");
  const ctxBase = { fullSource: SRC } as AuditToolContext;
  const detMissing = coreMissingFor(ctxBase, { requiresLM: requiresProposalSections("Solicitation") });
  ok("deterministic pass: §L/§M (and §C) missing (the 80NSSC class)", detMissing.includes("L") && detMissing.includes("M"));

  // Apply L3 EXACTLY as runAgenticAudit does: merge verified locates over the deterministic base onto ctx.sections.
  const ctxAfterHonest = { fullSource: SRC } as AuditToolContext;
  const honestLocated = (await runSectionFinder({ fullSource: SRC, targetKeys: detMissing.filter((k) => /^[A-M]$/.test(k)), finder: honest })).located;
  ctxAfterHonest.sections = { ...materializeSections(ctxAfterHonest), ...honestLocated };
  eq("after VERIFIED locate → coreMissing CLEARS to [] (COMPLETE)", coreMissingFor(ctxAfterHonest, { requiresLM: requiresProposalSections("Solicitation") }), []);

  const ctxAfterLiar = { fullSource: SRC } as AuditToolContext;
  const liarLocated = (await runSectionFinder({ fullSource: SRC, targetKeys: detMissing.filter((k) => /^[A-M]$/.test(k)), finder: liar })).located;
  if (Object.keys(liarLocated).length > 0) ctxAfterLiar.sections = { ...materializeSections(ctxAfterLiar), ...liarLocated };
  const stillMissing = coreMissingFor(ctxAfterLiar, { requiresLM: requiresProposalSections("Solicitation") });
  ok("after REJECTED locate → coreMissing STILL names §L/§M (honest INCOMPLETE, no false-COMPLETE)", stillMissing.includes("L") && stillMissing.includes("M"));

  console.log("── FULL-ORCHESTRATOR WIRING (runAgenticAudit): L3 augments the engine's own coreMissing ──");
  // Minimal stub: one expert that reads §L/§M then produces no findings — coreMissing is computed off ctx, so the
  // assertions isolate L3's effect on the engine's coverage output, exercising the REAL runAgenticAudit path.
  const stub: CallModel = async ({ priorToolResults }) =>
    priorToolResults.length === 0
      ? { toolCalls: [{ id: "rL", name: "read_section", input: { key: "L" } }, { id: "rM", name: "read_section", input: { key: "M" } }], findings: null }
      : { toolCalls: [], findings: [] };
  const experts = [{ key: "ko", system: "X" }];
  const base = { experts, callModel: stub, noticeType: "Solicitation" as const };

  const resNoFinder = await runAgenticAudit({ ctx: { fullSource: SRC }, ...base });
  ok("flag-OFF (no finder) → coreMissing still names §L/§M (byte-identical baseline)", resNoFinder.coverage.coreMissing.includes("L") && resNoFinder.coverage.coreMissing.includes("M"));

  const resHonest = await runAgenticAudit({ ctx: { fullSource: SRC }, ...base, sectionFinder: honest });
  eq("honest finder in the engine → coreMissing CLEARS to [] (COMPLETE)", resHonest.coverage.coreMissing, []);

  const resLiar = await runAgenticAudit({ ctx: { fullSource: SRC }, ...base, sectionFinder: liar });
  ok("liar finder in the engine → coreMissing STILL names §L/§M (fail-safe INCOMPLETE, no false-COMPLETE)", resLiar.coverage.coreMissing.includes("L") && resLiar.coverage.coreMissing.includes("M"));

  console.log("── DETERMINISM: same inputs → identical located map ──");
  const a = await runSectionFinder({ fullSource: SRC, targetKeys: ["C", "L", "M"], finder: honest });
  const b = await runSectionFinder({ fullSource: SRC, targetKeys: ["C", "L", "M"], finder: honest });
  eq("two runs identical (deterministic given the finder)", a.located, b.located);

  console.log(`\n${fail === 0 ? "✅" : "❌"} Layer-3 section-finder: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
