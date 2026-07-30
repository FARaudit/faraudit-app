// Gauntlet Bench Protocol — deterministic launcher-prompt composer + dry-run proof.
// Reads the skeleton from authorities/GAUNTLET-BENCH-PROTOCOL.md, fills the slots, DERIVES the B1 budget
// (finding/forensic→ultrathink, stamp→think hard) and the B3 split (mandatory on verdict-path surfaces),
// prints the composed prompt, and ASSERTS the B1/B2/B3 directives are present.
// Run:  node scripts/audit-ai/_gauntlet-compose.mjs '<json round spec>'   (omit arg → synthetic default)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTOCOL = resolve(HERE, "../../.claude/agents/authorities/GAUNTLET-BENCH-PROTOCOL.md");

const VERDICT_PATH_SURFACES = ["classifier", "gate", "matcher", "typing-map"];
const budgetFor = (roundType) => (["finding", "forensic"].includes(roundType) ? "ultrathink" : "think hard");
const splitFor = (surfaceClass) =>
  VERDICT_PATH_SURFACES.some((s) => (surfaceClass || "").toLowerCase().includes(s))
    ? "MANDATORY (verdict-path boundary surface — an independent judge that did not author the probes is required)"
    : "OPTIONAL (Code discretion — non-verdict-path surface)";

export function composeRound(spec) {
  const md = readFileSync(PROTOCOL, "utf8");
  const skeleton = md.split("<!-- SKELETON:BEGIN -->")[1].split("<!-- SKELETON:END -->")[0].trim();
  const filled = {
    ...spec,
    BUDGET: budgetFor(spec.ROUND_TYPE),
    SPLIT_DIRECTIVE: splitFor(spec.SURFACE_CLASS),
  };
  return skeleton.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in filled ? String(filled[k]) : `{{${k}}}`));
}

// ── dry-run: synthetic round (a FINDING round attacking a matcher — a verdict-path surface) ──
const DEFAULT = {
  ROUND_N: "N",
  ROUND_TYPE: "finding",
  TARGET_TITLE: "the grounding matcher's relaxed-acceptance bar",
  BRANCH: "phase3-example",
  HEAD: "<sha>",
  REPORT_PATH: "ceo/redteam-XXX-rN.md",
  PRIOR_ROUNDS: "ceo/redteam-XXX-r{1..N-1}.md",
  TARGET_DETAIL: "passesSubstantiveBar + groundedBy relaxed path",
  SURFACE_CLASS: "matcher (verdict-path boundary)",
  REPLAY_REPORT: "/tmp/gauntlet-replay-report.txt",
  SANCTIONED_LEDGER: "<carried ledger rows>",
  DELIVERABLE: "grade + DRY ruling + updated ledger",
};

const spec = process.argv[2] ? JSON.parse(process.argv[2]) : DEFAULT;
const composed = composeRound(spec);
console.log("=== COMPOSED ROUND PROMPT (dry-run) ===\n");
console.log(composed);
console.log("\n=== DIRECTIVE ASSERTIONS ===");
let fail = 0;
const assert = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
// B1 — the derived budget keyword is present and correct for the round type
assert(composed.includes(budgetFor(spec.ROUND_TYPE)), `B1 budget "${budgetFor(spec.ROUND_TYPE)}" present for a ${spec.ROUND_TYPE} round`);
assert(!composed.includes("{{BUDGET}}"), "B1 slot resolved (no residual {{BUDGET}})");
// B2 — the three-part taxonomy-first spine is present, in order
const iFam = composed.indexOf("ENUMERATE ATTACK FAMILIES FIRST");
const iMin = composed.indexOf("MINIMUM one executed probe per family, NO maximum");
const iSelf = composed.indexOf("SELF-ATTACK every candidate finding");
assert(iFam > 0 && iMin > iFam && iSelf > iMin, "B2 spine present in order (families → min-not-max → self-attack)");
// B3 — the split directive resolved and matches the surface class
assert(composed.includes("GENERATOR/JUDGE SPLIT:") && !composed.includes("{{SPLIT_DIRECTIVE}}"), "B3 split directive resolved");
assert(composed.includes(splitFor(spec.SURFACE_CLASS).slice(0, 9)), `B3 split correct for surface "${spec.SURFACE_CLASS}"`);
// B4a — replay is pointed at the script report, not a model re-run
assert(/SCRIPT, not model/.test(composed) && composed.includes("_gauntlet-replay.sh"), "B4a replay = script (read the harness report)");
console.log(fail === 0 ? "\n✅ ALL DIRECTIVES PRESENT — skeleton renders B1/B2/B3/B4a" : `\n❌ ${fail} MISSING`);
process.exit(fail === 0 ? 0 : 1);
