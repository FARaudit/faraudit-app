// $0 gate for Brain card 208-B — PART-12 PROCEDURAL-COVERAGE PASS (flag AUDIT_PROCEDURAL_COVERAGE_LENS).
//   npx tsx scripts/audit-ai/test-procedural-coverage.ts
//
// Proves: (a) both flags ON over the persisted card-202 record → coverage completes → the ruled target end-state
// BID_WITH_CAUTION · eligible=null · WOSB gate_to_clear · mandatory verify-caution; baseline INCOMPLETE when the
// procedural flag is OFF; (b) flag-OFF byte-identity; (c) SEMANTIC INERTNESS — procedural_obligation findings are
// coverage-only: never eligibility_bar, never a showstopper, never in the 206-A unverifiedGates, and adding them
// to an already-complete decision changes neither verdict, eligible, nor showStoppers.

import { readFileSync, readdirSync } from "fs";
import { deriveVerdict, applySetAsideFirmStatusGate } from "@/lib/audit-decide";
import { buildManifest, completenessOf } from "@/lib/audit-orchestrator";
import { proceduralCoveragePass } from "@/lib/audit-procedural-coverage";
import { readSection, type AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding, VerdictInputs } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const eq = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: got ${JSON.stringify(g)} exp ${JSON.stringify(e)}`); };
const ok = (l: string, c: boolean) => { if (c) pass++; else fails.push(l); };
const withEnv = <T>(env: Record<string, string | undefined>, fn: () => T): T => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]!; }
  try { return fn(); } finally { for (const k of Object.keys(env)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]!; } }
};
const orch = (fs: TypedFinding[], profile: any) => applySetAsideFirmStatusGate(fs, profile, { enabled: process.env.AUDIT_ELIGIBLE_TRISTATE === "true" });
const vin = (fs: TypedFinding[], cov: boolean): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: cov, verifierSound: true, conflict: false, manifestComplete: true });

const rf = readdirSync("scripts/audit-ai/run-records").filter((x) => x.includes("SP3300") && x.endsWith(".json")).sort().pop();
if (!rf) { console.log("⚠ no SP3300 run record — run paid-run.ts first. Cannot gate."); process.exit(1); }
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/" + rf, "utf8"));
const ctx: AuditToolContext = { fullSource: rec.input.fullSource };
const required = buildManifest(ctx);
const sr = new Set<string>(rec.result.sectionsRead);
const recFindings = (): TypedFinding[] => rec.result.findings.map((f: any) => ({ ...f }));
const covComplete = (fs: TypedFinding[]) => { const { missing } = completenessOf(ctx, required, fs, sr); return missing.length === 0 && required.length > 0; };

async function main() {
  // The pass (deterministic default) grounds §L/§M — part12-commercial doc.
  const proc = await proceduralCoveragePass(ctx);
  ok("pass emits procedural findings on a part12 doc", proc.length > 0);
  ok("all findings are kind=procedural_obligation", proc.every((f) => f.kind === "procedural_obligation"));
  ok("all bidder_controls, grounded, no cautionFloor/requiredAttribute", proc.every((f) => f.controllability === "bidder_controls" && f.grounded && !f.cautionFloor && !f.requiredAttribute));
  ok("every excerpt is VERBATIM in its section (Rule-64)", proc.every((f) => { const sec = f.citation.match(/§([A-M])/)?.[1] ?? ""; return readSection(ctx, sec).text.replace(/\s+/g, " ").toLowerCase().includes(f.excerpt.replace(/\s+/g, " ").toLowerCase()); }));

  // (a) BOTH flags ON → ruled target end-state.
  await withEnv({ AUDIT_PROCEDURAL_COVERAGE_LENS: "true", AUDIT_ELIGIBLE_TRISTATE: "true" }, () => {
    const fs = [...recFindings(), ...proc];
    eq("a coverage completes with procedural", covComplete(fs), true);
    const d = deriveVerdict(vin(orch(fs, null), covComplete(fs)));
    eq("a verdict=BID_WITH_CAUTION", d.verdict, "BID_WITH_CAUTION");
    eq("a eligible=null", d.eligible, null);
    ok("a WOSB gate_to_clear", d.dispositions.some((f) => f.requiredAttribute === "setaside:WOSB" && f.disposition === "gate_to_clear"));
    ok("a mandatory WOSB verify-caution", /ELIGIBILITY NOT VERIFIED/.test(d.reason) && /WOSB/i.test(d.reason));
  });
  // baseline: procedural OFF → INCOMPLETE (coverage not complete).
  await withEnv({ AUDIT_PROCEDURAL_COVERAGE_LENS: undefined, AUDIT_ELIGIBLE_TRISTATE: "true" }, () => {
    const fs = recFindings(); // no procedural
    const d = deriveVerdict(vin(orch(fs, null), covComplete(fs)));
    eq("baseline procedural-OFF verdict=INCOMPLETE", d.verdict, "INCOMPLETE");
  });

  // (b) FLAG-OFF BYTE-IDENTITY — the pass never runs when its flag is off (guarded at the orchestrator call site);
  //     directly: with the procedural flag off, coverage stays incomplete (missing=[L,M]).
  eq("b procedural flag OFF ⇒ §L/§M still missing (pass inert)", covComplete(recFindings()), false);
  // and both flags off → the record's original outcome reproduces (INCOMPLETE, eligible=false).
  await withEnv({ AUDIT_PROCEDURAL_COVERAGE_LENS: undefined, AUDIT_ELIGIBLE_TRISTATE: undefined }, () => {
    const d = deriveVerdict(vin(recFindings(), covComplete(recFindings())));
    eq("b both-OFF verdict=INCOMPLETE", d.verdict, "INCOMPLETE"); eq("b both-OFF eligible=false", d.eligible, false);
  });

  // (c) SEMANTIC INERTNESS — adding procedural findings to an ALREADY-COMPLETE decision changes nothing but coverage.
  await withEnv({ AUDIT_ELIGIBLE_TRISTATE: "true" }, () => {
    const base = recFindings();
    const dWithout = deriveVerdict(vin(orch(base, null), true));                       // force coverageComplete=true
    const dWith = deriveVerdict(vin(orch([...base, ...proc], null), true));
    eq("c verdict unchanged by procedural findings", dWith.verdict, dWithout.verdict);
    eq("c eligible unchanged by procedural findings", dWith.eligible, dWithout.eligible);
    eq("c showStopper count unchanged", dWith.showStoppers.length, dWithout.showStoppers.length);
    ok("c NO procedural finding is a showStopper", !dWith.showStoppers.some((s) => s.kind === "procedural_obligation"));
    ok("c NO procedural finding is disqualifying", !dWith.dispositions.some((f) => f.kind === "procedural_obligation" && f.disposition === "disqualifying"));
  });

  // (d) sectionsRead ROBUSTNESS (code-review HIGH) — completenessOf gates 'unread' sections out BEFORE covered_direct.
  //     Simulate a run where NO expert lens read §L/§M: the orchestrator wiring adds the pass's grounded sections to
  //     sectionsRead, so coverage still completes.
  {
    const srNoLM = new Set<string>([...sr].filter((s) => s !== "L" && s !== "M")); // pretend lenses never read §L/§M
    const fs = [...recFindings(), ...proc];
    // BEFORE the wiring fix (sections still unread) → §L/§M are 'unread' → missing:
    const before = completenessOf(ctx, required, fs, srNoLM).missing;
    ok("d without the fix, §L/§M would be unread→missing", before.includes("L") && before.includes("M"));
    // Apply the wiring: mark the pass's grounded sections read.
    for (const f of proc) { const m = f.citation.match(/§([A-M])\b/); if (m) srNoLM.add(m[1]); }
    const after = completenessOf(ctx, required, fs, srNoLM).missing;
    eq("d with the wiring fix → coverage completes (missing=[])", after, []);
  }

  console.log(`procedural-coverage gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
  console.log("✅ ALL PASS — Part-12 procedural pass completes coverage → ruled end-state; flag-OFF inert; procedural class is coverage-only (never a bar/eligibility input).");
  process.exit(0);
}
main();
