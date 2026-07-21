// $0 CERT — CLAIM→SECTION/EXCERPT TAGGING (Brain cards #614 Ch.3 / #615.3). Run:
//   npx tsx scripts/audit-ai/_cert-claim-section-tagging.ts
// Proves the stopwatch instrumentation is CORRECT (lens→section map via ref prefix, gate/risk counts, claim-char
// sum) and VERDICT-INERT (pure read — never mutates the claim array it tags). Instrumentation only; no paid call.
import { tagClaimsBySection, formatClaimSectionTags } from "../../src/lib/agentic-panel-runner";
import { lensAssignedSections } from "../../src/lib/agentic-sections";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

// A representative bound-claim set: two lenses, mixed gate/risk, ref prefix = lens key (as runPanelJudge builds).
const claims = [
  { ref: "contracts_attorney:G1", kind: "gate" as const, text: "GATE: 52.219-14 (met=false) [EXCERPT✓] — excerpt: \"...\"" },
  { ref: "contracts_attorney:R1", kind: "risk" as const, text: "RISK(P1): clause tail [EXCERPT✓] — excerpt: \"abc\"" },
  { ref: "proposal_manager:R1", kind: "risk" as const, text: "RISK(P2): §L page-limit [EXCERPT-UNGROUNDED] — excerpt: \"\"" },
];
const frozen = JSON.parse(JSON.stringify(claims)); // deep snapshot to prove non-mutation

const tags = tagClaimsBySection(claims, "commercial");

// ── correctness: one tag per lens, gate/risk counts, claim-char sum ──
ok(tags.length === 2, "one tag per distinct lens key");
const ca = tags.find((t) => t.lensKey === "contracts_attorney")!;
ok(ca && ca.gates === 1 && ca.risks === 1, "contracts_attorney: 1 gate + 1 risk counted");
ok(ca.claimChars === claims[0].text.length + claims[1].text.length, "claim-chars = Σ text length for that lens");
ok(JSON.stringify(ca.sections) === JSON.stringify(lensAssignedSections("contracts_attorney", "commercial")), "sections come from lensAssignedSections(lensKey, docClass)");
const pm = tags.find((t) => t.lensKey === "proposal_manager")!;
ok(pm && pm.gates === 0 && pm.risks === 1, "proposal_manager: 0 gate + 1 risk");

// ── doc-class sensitivity: UCF vs commercial can route different sections (proves docClass is actually applied) ──
const ucf = tagClaimsBySection(claims, "ucf").find((t) => t.lensKey === "contracts_attorney")!;
ok(JSON.stringify(ucf.sections) === JSON.stringify(lensAssignedSections("contracts_attorney", "ucf")), "UCF docClass routes to its own section set");

// ── unknown lens key degrades safely (never throws) ──
const weird = tagClaimsBySection([{ ref: "not_a_lens:G1", kind: "gate", text: "x" }], "commercial");
ok(weird.length === 1 && weird[0].lensKey === "not_a_lens", "unknown lens key tagged, no throw");

// ── VERDICT-INERT: the input claim array is untouched (pure read) ──
ok(JSON.stringify(claims) === JSON.stringify(frozen), "tagClaimsBySection NEVER mutates its input (verdict-inert)");

// ── formatter renders without throwing + reflects the totals ──
const out = formatClaimSectionTags(tags);
ok(out.includes("3 claim(s)") && out.includes("1 gate") && out.includes("2 risk"), "formatter reports the correct claim/gate/risk totals");

console.log(`\n${fail === 0 ? "✅ CLAIM→SECTION TAGGING DRY: ALL PASS" : `❌ ${fail} FAILURE(S)`}`);
process.exit(fail === 0 ? 0 : 1);
