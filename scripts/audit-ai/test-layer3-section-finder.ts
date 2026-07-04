// Layer-3 (Brain card 265/267) — grounded section-finder: load-bearing NEGATIVES + completeness-integration test.
//   npx tsx scripts/audit-ai/test-layer3-section-finder.ts   ($0, deterministic — stubbed finder, no model call)
// Proves the hardened fail-safe gate (adversarial-review-driven): a fabricated OR AMBIGUOUS anchor is REJECTED (a
// wrong/right-phrase-wrong-place locate can NEVER mint a false-COMPLETE), a long §L is NOT truncated (no hidden
// obligations past a window), located sections are boundary-PARTITIONED (no cross-section bleed), and a VERIFIED
// locate clears coreMissingFor exactly as the engine (runAgenticAudit) does it.
import { locateUniqueAnchor, runSectionFinder, type SectionFinderCall } from "@/lib/audit-section-finder";
import { coreMissingFor, runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel } from "@/lib/audit-expert";
import { materializeSections, requiresProposalSections, type AuditToolContext } from "@/lib/audit-tools";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}\n      got ${g}\n      want ${w}`); }
};
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// Distinctive, UNIQUE anchors an honest finder returns (each appears exactly once in SRC).
const ANCHOR_L = "as a technical approach describing the proposed solution and a separately priced schedule";
const ANCHOR_M = "The Government will evaluate quotes on a lowest-price technically-acceptable basis";
// An AMBIGUOUS phrase deliberately repeated (§C tail + §L opener) — a right-phrase/wrong-place anchor.
const AMBIG = "The offeror shall submit the following information";
// A fabricated anchor NOT present anywhere in SRC.
const ANCHOR_FAKE = "Award will be made to the lowest responsible bidder meeting the mandatory CMMC Level 3 requirement";
// A LONG §L region (> 6000 chars) between the §L and §M anchors — proves no fixed-window truncation.
const FILLER = " The offeror shall address each of the mandatory instruction items in turn.".repeat(120); // ~9000 chars
const SRC =
  "STATEMENT OF WORK\n" +
  "The contractor shall furnish the Rockland Piston Cylinder System per the specifications herein. " + AMBIG + " for the property record.\n" +
  "INSTRUCTIONS. " + AMBIG + " " + ANCHOR_L + " no later than the response date." + FILLER + "\n" +
  ANCHOR_M + "; a quote that fails any salient characteristic will be found technically unacceptable.";

async function main() {
  console.log("── THE HARDENED GATE (locateUniqueAnchor): trust a locate ONLY if the anchor is UNIQUE ──");
  ok("unique substantive anchor → offset ≥ 0", locateUniqueAnchor(SRC, ANCHOR_L) >= 0);
  eq("fabricated anchor (absent) → REJECTED (-1)", locateUniqueAnchor(SRC, ANCHOR_FAKE), -1);
  eq("AMBIGUOUS anchor (appears twice: §C + §L) → REJECTED (-1) — the false-COMPLETE path the review found", locateUniqueAnchor(SRC, AMBIG), -1);
  eq("too-short anchor (< 24 non-ws) → REJECTED (-1)", locateUniqueAnchor(SRC, "evaluate"), -1);
  ok("whitespace-insensitive match (collapsed spaces) → located", locateUniqueAnchor(SRC, "as a technical    approach describing the proposed solution and a separately priced schedule") >= 0);

  console.log("── runSectionFinder: unique locate → boundary PARTITION, no truncation, no bleed ──");
  const honest: SectionFinderCall = async ({ sectionKey }) =>
    ({ L: { located: true, anchor: ANCHOR_L }, M: { located: true, anchor: ANCHOR_M } }[sectionKey] ?? { located: false, anchor: null });
  const r1 = await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: honest });
  eq("honest finder → §L and §M located", Object.keys(r1.located).sort(), ["L", "M"]);
  ok("§L NOT truncated (spans the long region, > 6000 chars)", (r1.located.L?.length ?? 0) > 6000);
  ok("§L does NOT bleed into §M (boundary partition — stops at §M's anchor)", !r1.located.L!.includes("lowest-price technically-acceptable"));
  ok("§M carries the evaluation content", r1.located.M!.includes("lowest-price technically-acceptable"));

  console.log("── LOAD-BEARING NEGATIVES: fabricated / ambiguous / not-located / error all REJECT (fail-safe) ──");
  const liar: SectionFinderCall = async () => ({ located: true, anchor: ANCHOR_FAKE });
  const r2 = await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: liar });
  eq("fabricated-anchor finder → ZERO located", Object.keys(r2.located), []);
  ok("both attempts flagged rejected", r2.attempts.length === 2 && r2.attempts.every((a) => a.rejected && !a.located));
  const ambig: SectionFinderCall = async () => ({ located: true, anchor: AMBIG });
  eq("ambiguous-anchor finder → ZERO located (right phrase, unprovable place)", Object.keys((await runSectionFinder({ fullSource: SRC, targetKeys: ["L"], finder: ambig })).located), []);
  const notFound: SectionFinderCall = async () => ({ located: false, anchor: null });
  eq("honest not-located → ZERO located", Object.keys((await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: notFound })).located), []);
  const thrower: SectionFinderCall = async () => { throw new Error("model timeout"); };
  const r3 = await runSectionFinder({ fullSource: SRC, targetKeys: ["L"], finder: thrower });
  eq("finder error → caught, ZERO located (never thrown)", Object.keys(r3.located), []);
  ok("finder error logged in the attempt trail", r3.attempts[0]?.reason.includes("finder error"));
  eq("§C is OUT of L3 scope (FINDER_KEYS = L,M) — never over-cleared", Object.keys((await runSectionFinder({ fullSource: SRC, targetKeys: ["C", "L", "M"], finder: async ({ sectionKey }) => ({ located: true, anchor: sectionKey === "C" ? ANCHOR_L : (sectionKey === "L" ? ANCHOR_L : ANCHOR_M) }) })).located).sort(), ["L", "M"]);

  console.log("── COMPLETENESS INTEGRATION: locating §L/§M clears coreMissingFor (§C drops via anyCore) ──");
  const ctxBase = { fullSource: SRC } as AuditToolContext;
  const detMissing = coreMissingFor(ctxBase, { requiresLM: requiresProposalSections("Solicitation") });
  ok("deterministic pass: §L/§M missing (80NSSC class)", detMissing.includes("L") && detMissing.includes("M"));
  const ctxHonest = { fullSource: SRC } as AuditToolContext;
  ctxHonest.sections = { ...materializeSections(ctxHonest), ...(await runSectionFinder({ fullSource: SRC, targetKeys: detMissing, finder: honest })).located };
  eq("after VERIFIED §L/§M locate → coreMissing CLEARS to [] (§C dropped via anyCore=true)", coreMissingFor(ctxHonest, { requiresLM: requiresProposalSections("Solicitation") }), []);
  const ctxLiar = { fullSource: SRC } as AuditToolContext;
  const liarLocated = (await runSectionFinder({ fullSource: SRC, targetKeys: detMissing, finder: liar })).located;
  if (Object.keys(liarLocated).length) ctxLiar.sections = { ...materializeSections(ctxLiar), ...liarLocated };
  ok("after REJECTED locate → coreMissing STILL names §L/§M (honest INCOMPLETE, no false-COMPLETE)", coreMissingFor(ctxLiar, { requiresLM: requiresProposalSections("Solicitation") }).includes("L"));

  console.log("── FULL-ORCHESTRATOR WIRING (runAgenticAudit): L3 augments the engine's own coreMissing ──");
  const stub: CallModel = async ({ priorToolResults }) =>
    priorToolResults.length === 0
      ? { toolCalls: [{ id: "rL", name: "read_section", input: { key: "L" } }, { id: "rM", name: "read_section", input: { key: "M" } }], findings: null }
      : { toolCalls: [], findings: [] };
  const base = { experts: [{ key: "ko", system: "X" }], callModel: stub, noticeType: "Solicitation" as const };
  const resNoFinder = await runAgenticAudit({ ctx: { fullSource: SRC }, ...base });
  ok("flag-OFF (no finder) → coreMissing still names §L/§M (byte-identical baseline)", resNoFinder.coverage.coreMissing.includes("L") && resNoFinder.coverage.coreMissing.includes("M"));
  const resHonest = await runAgenticAudit({ ctx: { fullSource: SRC }, ...base, sectionFinder: honest });
  eq("honest finder in the engine → coreMissing CLEARS to []", resHonest.coverage.coreMissing, []);
  const resLiar = await runAgenticAudit({ ctx: { fullSource: SRC }, ...base, sectionFinder: liar });
  ok("liar finder in the engine → coreMissing STILL names §L/§M (fail-safe)", resLiar.coverage.coreMissing.includes("L"));

  console.log("── DETERMINISM: same inputs → identical located map ──");
  const a = await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: honest });
  const b = await runSectionFinder({ fullSource: SRC, targetKeys: ["L", "M"], finder: honest });
  eq("two runs identical (deterministic given the finder)", a.located, b.located);

  console.log(`\n${fail === 0 ? "✅" : "❌"} Layer-3 section-finder: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
