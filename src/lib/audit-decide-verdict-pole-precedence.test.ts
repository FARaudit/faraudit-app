// Vehicle A–E · item A cert — verdict-pole precedence (flag AUDIT_VERDICT_POLE_PRECEDENCE, default-OFF).
// Run: npx tsx src/lib/audit-decide-verdict-pole-precedence.test.ts
// Reproduces the FA813726R0033 e63bd1e7 pole-flip at the verdict layer: a grounded operative-language DISQUALIFYING
// eligibility bar (BOA-holders-only) on a fully-read package must OUTRANK the documentsComplete=false INCOMPLETE cap
// when the narrowed dispositive-completeness precondition holds — a non-dispositive WD OCR-hold must not bury it.
export {}; // MODULE scope — env set before the dynamic import (flag read at call time, but keep the pattern consistent)
type TypedFinding = import("./audit-findings").TypedFinding;
type VerdictInputs = import("./audit-findings").VerdictInputs;

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

async function main() {
  const { deriveVerdict } = await import("./audit-decide");
  const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
  // BOA-holders-only — grounded eligibility_bar, bidder-uncontrollable, operative "holders only" language in excerpt.
  const boaBar = (): TypedFinding => ({
    requirement: "Order restricted to current Tinker MAC BOA holders only; a firm that does not hold the vehicle cannot bid.",
    citation: "SAM Notice Body",
    excerpt: "this posting is for tinker afb - mac boa holders only.",
    kind: "eligibility_bar", controllability: "bidder_cannot_move",
    grounded: true, lens: "ex_ko", curableInWindow: false,
  });
  // Same bar shape but excerpt WITHOUT operative language (bare concluded-site-visit recital) — E predicate must NOT promote.
  const recital = (): TypedFinding => ({
    requirement: "A site visit was held.", citation: "SAM Notice Body",
    excerpt: "site visit was held and concluded on may 28, 2026.",
    kind: "eligibility_bar", controllability: "bidder_cannot_move",
    grounded: true, lens: "ex_ko", curableInWindow: false,
  });
  const mk = (findings: TypedFinding[], over: Partial<VerdictInputs>): VerdictInputs =>
    ({ findings, ...base, source: "this posting is for tinker afb - mac boa holders only.", documentsComplete: false, ...over });

  console.log("\n── 1 · FLAG OFF ⇒ documentsComplete=false caps to INCOMPLETE (baseline, byte-identical) ──");
  {
    delete process.env.AUDIT_VERDICT_POLE_PRECEDENCE;
    const d = deriveVerdict(mk([boaBar()], { dispositiveCompletenessForEligibility: true }));
    assert(d.verdict === "INCOMPLETE", `flag-OFF ⇒ INCOMPLETE (got ${d.verdict})`);
  }

  console.log("\n── 2 · FLAG ON + precondition TRUE + grounded operative bar ⇒ eligibility pole OUTRANKS INCOMPLETE ──");
  {
    process.env.AUDIT_VERDICT_POLE_PRECEDENCE = "true";
    const d = deriveVerdict(mk([boaBar()], { dispositiveCompletenessForEligibility: true }));
    assert(d.verdict === "NEEDS_HUMAN_REVIEW", `flag-ON ⇒ conditional-NHR eligibility pole (got ${d.verdict})`);
    assert(/holder|eligib|bid/i.test(d.reason), `reason names the eligibility gate (got: ${d.reason.slice(0, 90)}…)`);
    assert(d.showStoppers.length >= 1, `the bar is surfaced as a show-stopper (got ${d.showStoppers.length})`);
  }

  console.log("\n── 3 · FLAG ON + precondition FALSE (a dispositive doc content-lost) ⇒ A does NOT fire ⇒ INCOMPLETE ──");
  {
    process.env.AUDIT_VERDICT_POLE_PRECEDENCE = "true";
    const d = deriveVerdict(mk([boaBar()], { dispositiveCompletenessForEligibility: false }));
    assert(d.verdict === "INCOMPLETE", `precondition false ⇒ INCOMPLETE (got ${d.verdict})`);
  }

  console.log("\n── 4 · FLAG ON + precondition TRUE but only a bare recital (no operative language) ⇒ E gate blocks promotion ⇒ INCOMPLETE ──");
  {
    process.env.AUDIT_VERDICT_POLE_PRECEDENCE = "true";
    const d = deriveVerdict(mk([recital()], { dispositiveCompletenessForEligibility: true, source: "site visit was held and concluded on may 28, 2026." }));
    assert(d.verdict === "INCOMPLETE", `bare recital (no operative eligibility language) ⇒ not promoted ⇒ INCOMPLETE (got ${d.verdict})`);
  }

  console.log("\n── 5 · FLAG ON + precondition UNDEFINED ⇒ A inert ⇒ INCOMPLETE (byte-identical to OFF) ──");
  {
    process.env.AUDIT_VERDICT_POLE_PRECEDENCE = "true";
    const d = deriveVerdict(mk([boaBar()], {})); // no dispositiveCompletenessForEligibility
    assert(d.verdict === "INCOMPLETE", `precondition undefined ⇒ A inert ⇒ INCOMPLETE (got ${d.verdict})`);
  }

  console.log("\n── 6 · FLAG ON + precondition TRUE but documentsComplete=TRUE (fully read) ⇒ A does NOT preempt (fix #3) ──");
  {
    process.env.AUDIT_VERDICT_POLE_PRECEDENCE = "true";
    const d = deriveVerdict(mk([boaBar()], { dispositiveCompletenessForEligibility: true, documentsComplete: true }));
    assert(!/no additional documents are needed/i.test(d.reason), `documentsComplete=true ⇒ item A step-0-A does not fire its reason (got: ${d.reason.slice(0, 70)}…)`);
  }

  console.log(failures === 0 ? "\n✅ ALL GREEN — vehicle A verdict-pole precedence" : `\n❌ ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
