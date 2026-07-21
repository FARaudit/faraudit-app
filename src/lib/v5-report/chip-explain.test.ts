// SCORECARD CHIP EXPLANATIONS — card #612-(3e). Coverage + Eligibility tiles carry a
// one-line explanation so "5 / 5 · incomplete" and "Not determined" don't read as a
// bare contradiction / unexplained flag.
// Run: npx tsx src/lib/v5-report/chip-explain.test.ts
import { scorecardTiles } from "./core";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
function data(over: any): any {
  return { verdict: { pole: "BID_WITH_CAUTION", noVerdict: false, eligible: null, ...(over.verdict||{}) },
    coverage: { state: "COMPLETE", read: 5, total: 5, missing: [], ...(over.coverage||{}) },
    findings: { p0: [], p1: [], p2: [], ...(over.findings||{}) } };
}
const tile = (d: any, k: string) => scorecardTiles(d).find((t) => t.k === k)!;

// LBJ: all read, §L flagged, eligibility not determined
{
  const d = data({ verdict: { eligible: null }, coverage: { state: "INCOMPLETE", read: 5, total: 5, missing: ["L"] } });
  assert(/all read · 1 section to confirm/.test(tile(d, "Coverage").sub), "coverage: 'all read · 1 section to confirm' (no 5/5-vs-incomplete contradiction)");
  assert(tile(d, "Eligibility").sub === "confirm before you rely on it", "eligibility nd: explanatory one-liner");
}
// genuine partial read
{
  const d = data({ coverage: { state: "INCOMPLETE", read: 2, total: 5, missing: ["C"] } });
  assert(/partial read/.test(tile(d, "Coverage").sub), "coverage: partial read wording when read < total");
}
// complete + eligible
{
  const d = data({ verdict: { eligible: true }, coverage: { state: "COMPLETE", read: 5, total: 5 } });
  assert(tile(d, "Coverage").sub === "documents · complete", "coverage complete sub");
  assert(tile(d, "Eligibility").sub === "eligible on the facts read", "eligibility ok sub");
}
// ineligible
{
  const d = data({ verdict: { pole: "INELIGIBLE", noVerdict: false, eligible: false }, coverage: { state: "COMPLETE" } });
  assert(tile(d, "Eligibility").sub === "a verified bar applies", "eligibility no sub");
}
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
