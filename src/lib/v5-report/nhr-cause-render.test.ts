// Vehicle F · D2/D3 render cert — the walkthrough derives from the engine's noVerdictCause; conflict language renders
// ONLY for cause="conflict"; an absent/unknown cause renders the FAIL-LOUD neutral string (never a fabricated cause).
// Flag-OFF ⇒ the exact legacy "Cannot be reconciled" string ⇒ byte-identical.
// Run: npx tsx src/lib/v5-report/nhr-cause-render.test.ts
import { reasoningSteps } from "./render";
import { scorecardTiles } from "./core";
type V4Data = import("../v4-report/render").V4Data;

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const mkData = (cause?: string, p0 = 1): V4Data => ({
  masthead: { docType: "SOLICITATION", solicitation: "FA813726R0033", title: "t", facts: [] },
  verdict: { pole: "NEEDS_HUMAN_REVIEW", band: "NEEDS HUMAN REVIEW", tone: "slate", noVerdict: true, noCharge: true, eligible: null, rationale: "r", ...(cause ? { noVerdictCause: cause } : {}) },
  coverage: { state: "INCOMPLETE", lead: "", read: 9, indexed: 9, total: 9, core: [], missing: [], unreadable: [] },
  findings: { p0: Array.from({ length: p0 }, (_, i) => ({ req: `bar ${i}`, cite: "SAM", driver: true })), p1: [], p2: [] },
} as unknown as V4Data);

const detailOf = (d: V4Data) => reasoningSteps(d).map((s) => `${s.label}|${s.outcome}|${s.detail}`).join(" ⟂ ");
const CONFLICT = "Two grounded findings conflict";
const NEUTRAL = "the cause was not recorded in this report";

console.log("\n── flag OFF ⇒ legacy conflict string (byte-identical) ──");
delete process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE;
{
  const s = detailOf(mkData("eligibility"));   // even an eligibility cause renders legacy on OFF
  ok(s.includes(CONFLICT) && s.includes("Cannot be reconciled"), "flag-OFF renders the exact legacy conflict narrative");
}

console.log("\n── flag ON ⇒ per-cause true narrative ──");
process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE = "true";
{
  const elig = detailOf(mkData("eligibility"));
  ok(!elig.includes(CONFLICT), "eligibility cause does NOT render conflict language");
  ok(/Eligibility gate/.test(elig) && /Confirm your firm's status/.test(elig), "eligibility renders the gate + tier-1/tier-2 step");

  const conf = detailOf(mkData("conflict"));
  ok(conf.includes(CONFLICT), "conflict cause renders conflict language (the ONLY one)");

  for (const c of ["coverage", "verification", "primary_indeterminate"]) {
    const s = detailOf(mkData(c));
    ok(!s.includes(CONFLICT), `${c} cause does NOT render conflict language`);
  }

  // FAIL-LOUD: absent / unknown cause → neutral string, never conflict, never a guess
  const absent = detailOf(mkData(undefined));
  ok(!absent.includes(CONFLICT) && absent.includes(NEUTRAL), "absent cause → neutral TRUE string (fail-loud), not conflict");
  const unknown = detailOf(mkData("banana"));
  ok(!unknown.includes(CONFLICT) && unknown.includes(NEUTRAL), "unrecognized cause → neutral TRUE string (fail-loud), not conflict");

  // D3 tiles — eligibility cause surfaces the gate instead of "Not determined"
  const tiles = scorecardTiles(mkData("eligibility"));
  const ss = tiles.find((t) => t.k === "Show-stoppers");
  ok(ss?.v === "1" && /eligibility gate/i.test(ss?.sub ?? ""), `Show-stoppers tile surfaces the gate (got v=${ss?.v} sub="${ss?.sub}")`);
  // other causes keep "Not determined"
  const covTiles = scorecardTiles(mkData("coverage"));
  ok(covTiles.find((t) => t.k === "Show-stoppers")?.v === "Not determined", "non-eligibility cause keeps 'Not determined' tile");
}
delete process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE;

console.log(failures === 0 ? "\n✅ ALL GREEN — D2/D3 true-cause render" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
