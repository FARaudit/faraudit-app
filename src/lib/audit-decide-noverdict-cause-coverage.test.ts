// Vehicle F · D2 COVERAGE PROOF (Brain-mandated, before D2 certs pass) — every NHR return site in deriveVerdict is
// mapped to exactly ONE noVerdictCause; only the expert-conflict site may emit "conflict"; nothing is left untagged
// (an untagged site would render the fail-loud neutral string, never a fabricated cause). Two parts:
//   A · STATIC exhaustiveness — inspect the source: every real deriveVerdict NHR return (2nd arg honestFailEligible()/
//       nhrEligible()) carries a 6th cause arg; exactly one is "conflict". Catches any untagged / future site.
//   B · RUNTIME walk — trigger representative sites and assert deriveVerdict(inputs).noVerdictCause; conflict-exclusivity.
// Run: npx tsx src/lib/audit-decide-noverdict-cause-coverage.test.ts
import { readFileSync } from "node:fs";
import { deriveVerdict, type NoVerdictCause } from "./audit-decide";
type TypedFinding = import("./audit-findings").TypedFinding;
type VerdictInputs = import("./audit-findings").VerdictInputs;

let failures = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const CAUSES = ["conflict", "eligibility", "coverage", "primary_indeterminate", "verification"];

console.log("\n── A · STATIC exhaustiveness (source inspection) ──");
{
  const src = readFileSync("src/lib/audit-decide.ts", "utf8");
  // Real deriveVerdict NHR returns: mk("NEEDS_HUMAN_REVIEW", <honestFailEligible()|nhrEligible()>, … ) — the SHADOW
  // mk (deriveShadowVerdict) passes a STRING as 2nd arg, so this pattern excludes it by construction.
  const re = /mk\("NEEDS_HUMAN_REVIEW",\s*(?:honestFailEligible\(\)|nhrEligible\(\))[\s\S]*?\)\s*[;)]/g;
  const calls = src.match(re) || [];
  ok(calls.length >= 16, `found ${calls.length} real deriveVerdict NHR return sites (expected 16)`);
  const causeArg = (c: string): string | null => {
    const m = c.match(/,\s*"(conflict|eligibility|coverage|primary_indeterminate|verification)"\s*\)\s*[;)]?\s*$/);
    return m ? m[1] : null;
  };
  const tagged = calls.map(causeArg);
  const untagged = tagged.filter((t) => t === null).length;
  ok(untagged === 0, `every NHR site carries a cause tag (untagged: ${untagged}) — no site falls to the fail-loud path silently`);
  const conflictCount = tagged.filter((t) => t === "conflict").length;
  ok(conflictCount === 1, `exactly ONE site emits "conflict" (found ${conflictCount})`);
  const dist: Record<string, number> = {};
  tagged.forEach((t) => { if (t) dist[t] = (dist[t] || 0) + 1; });
  console.log("   cause distribution:", JSON.stringify(dist));
  CAUSES.forEach((c) => ok((dist[c] || 0) >= 1, `cause "${c}" is used by ≥1 site (used by ${dist[c] || 0})`));
}

console.log("\n── B · RUNTIME walk (trigger sites, assert cause + conflict-exclusivity) ──");
{
  const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
  const bar = (over: Partial<TypedFinding> = {}): TypedFinding => ({
    requirement: "A disqualifying bar.", citation: "SAM", excerpt: "bar", kind: "eligibility_bar",
    controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko", curableInWindow: false, ...over,
  });
  const D = (over: Partial<VerdictInputs>): VerdictInputs =>
    ({ findings: [], ...base, source: "src", ...over } as VerdictInputs);

  const cases: Array<{ name: string; inp: VerdictInputs; cause: NoVerdictCause }> = [
    { name: "primaryIndeterminate", inp: D({ primaryIndeterminate: true }), cause: "primary_indeterminate" },
    { name: "noticeBodyBarUngrounded", inp: D({ noticeBodyBarUngrounded: true }), cause: "eligibility" },
    { name: "unreadEvidence", inp: D({ unreadEvidence: [{ note: "attachment X referenced but absent" } as never] }), cause: "coverage" },
    { name: "setAsideConflict", inp: D({ setAsideConflict: { note: "SAM vs doc", sam: "8(a)", doc: "SDVOSB" } as never }), cause: "eligibility" },
    { name: "!verifierSound", inp: D({ verifierSound: false }), cause: "verification" },
    // conflict (3662) sits at step 4 — AFTER the empty-set guard (3567) and show-stoppers (step 3). Needs a benign,
    // decision-bearing, NON-disqualifying finding so the set isn't materially-empty and no show-stopper fires.
    { name: "conflict", inp: D({ conflict: true, findings: [bar({ kind: "pricing", controllability: "bidder_controls", curableInWindow: true, requirement: "Furnish a 20% bid guarantee.", excerpt: "A bid guarantee of 20% is required." })] }), cause: "conflict" },
    { name: "untyped bar", inp: D({ findings: [bar({ requiredAttribute: undefined, curableInWindow: undefined })] }), cause: "eligibility" },
    { name: "non-curable bar", inp: D({ findings: [bar({ requiredAttribute: "clearance", curableInWindow: false })] }), cause: "eligibility" },
  ];
  for (const c of cases) {
    const d = deriveVerdict(c.inp);
    ok(d.verdict === "NEEDS_HUMAN_REVIEW" && d.noVerdictCause === c.cause,
      `${c.name}: verdict=${d.verdict} cause=${d.noVerdictCause} (expected NHR/${c.cause})`);
  }
  // conflict-exclusivity: no non-conflict input yields "conflict"
  const wrongConflict = cases.filter((c) => c.cause !== "conflict").filter((c) => deriveVerdict(c.inp).noVerdictCause === "conflict");
  ok(wrongConflict.length === 0, `only the conflict input yields "conflict" (violators: ${wrongConflict.map((c) => c.name).join(",") || "none"})`);
  // every NHR carries a defined cause (fail-loud pin at the engine)
  const nhrNoCause = cases.filter((c) => { const d = deriveVerdict(c.inp); return d.verdict === "NEEDS_HUMAN_REVIEW" && !d.noVerdictCause; });
  ok(nhrNoCause.length === 0, `every triggered NHR carries a cause (untagged: ${nhrNoCause.map((c) => c.name).join(",") || "none"})`);
}

console.log(failures === 0 ? "\n✅ ALL GREEN — noVerdictCause coverage proof (21/22 mis-explanation class closed at the engine)" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
