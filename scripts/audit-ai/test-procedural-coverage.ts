// $0 gate for Brain card 208-B — PART-12 PROCEDURAL-COVERAGE PASS (flag AUDIT_PROCEDURAL_COVERAGE_LENS).
//   npx tsx scripts/audit-ai/test-procedural-coverage.ts
//
// Proves: (a) both flags ON over the persisted card-202 record → coverage completes → the ruled target end-state
// BID_WITH_CAUTION · eligible=null · WOSB gate_to_clear · mandatory verify-caution; baseline INCOMPLETE when the
// procedural flag is OFF; (b) flag-OFF byte-identity; (c) SEMANTIC INERTNESS — procedural_obligation findings are
// coverage-only: never eligibility_bar, never a showstopper, never in the 206-A unverifiedGates, and adding them
// to an already-complete decision changes neither verdict, eligible, nor showStoppers.

//
// ── RE-BASELINED 2026-08-04 (read this before the assertions below) ────────────────────────────────────────────
// As authored, this gate built VerdictInputs WITHOUT `coverageV2`. That shape reaches a legacy line
// (audit-decide.ts:3614, "!inp.coverageComplete ⇒ INCOMPLETE") which PRODUCTION NEVER REACHES: the orchestrator
// always supplies coverageV2 while AUDIT_GATE_V2 is on (audit-orchestrator.ts:3105), and it is on in production.
// So the gate's headline failure — "verdict got INCOMPLETE, expected BID_WITH_CAUTION" — was measuring a dead
// path, not the engine muting. Rebuilt to the production shape, the same record returns BID_WITH_CAUTION with the
// uncovered §C item NAMED: Rule 70 cap-not-mute holding, which is what this gate should have been pinning.
//
// Two coverage claims are retired with the reasons named, rather than deleted:
//   · "coverage completes (missing=[])" — later floors legitimately refuse blanket coverage on this record's §B,
//     §C and §M. §C is refused by name by the live-armed AUDIT_COVERED_DIRECT_BAR_FLOOR (ungrounded eligibility
//     bars co-resident with a grounded finding). Coverage completion is no longer the thing that decides the
//     verdict, so asserting it is asserting the pre-Rule-70 architecture.
//   · "procedural-OFF ⇒ INCOMPLETE baseline" — MEASURED FALSE on this record under the live flag set: §L is
//     covered by the ledger demotion (AUDIT_LEDGER_BROAD_AMBIGUOUS) with or without the procedural pass, so the
//     contrast the baseline drew is inert HERE. That is a fact about this record's §L (all-benign obligations),
//     not proof the pass is inert generally — a §L carrying a real bar would not demote.
import { readFileSync, readdirSync } from "fs";
import { deriveVerdict, applySetAsideFirmStatusGate } from "@/lib/audit-decide";
import { buildManifest, completenessOf, locateObligationContext } from "@/lib/audit-orchestrator";
import { gradeCoverageV2, verifyRecitalInSource, consequenceTailsAfter } from "@/lib/audit-gate-v2";
import { proceduralCoveragePass } from "@/lib/audit-procedural-coverage";
import { readSection, type AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding, VerdictInputs } from "@/lib/audit-findings";
import { requireCorpus, EXIT_CORPUS_ABSENT } from "@/lib/corpus-fixture";

// Declared BEFORE any assertion, per the corpus-fixture contract. This also covers the case the
// readdirSync below cannot: an empty run-records directory (`.gitkeep` makes it exist in a fresh
// checkout, so existence is not the question — record count is).
requireCorpus("procedural-coverage");

let pass = 0; const fails: string[] = [];
const eq = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: got ${JSON.stringify(g)} exp ${JSON.stringify(e)}`); };
const ok = (l: string, c: boolean) => { if (c) pass++; else fails.push(l); };
const withEnv = <T>(env: Record<string, string | undefined>, fn: () => T): T => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]!; }
  try { return fn(); } finally { for (const k of Object.keys(env)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]!; } }
};
const orch = (fs: TypedFinding[], profile: any) => applySetAsideFirmStatusGate(fs, profile, { enabled: process.env.AUDIT_ELIGIBLE_TRISTATE === "true" });
// PRODUCTION SHAPE — coverageV2 built exactly as audit-orchestrator.ts:3105 builds it. Without it the verdict
// runs the legacy pre-GATE_V2 line that production cannot reach (see the re-baseline note in the header).
const vin = (fs: TypedFinding[], cov: boolean, atts?: unknown[]): VerdictInputs => ({
  findings: fs, bidderProfile: null, coverageComplete: cov, verifierSound: true, conflict: false, manifestComplete: true,
  source: ctx.fullSource,
  ...(atts ? { coverageV2: gradeCoverageV2(atts as never, {
    locate: (o: string) => locateObligationContext(ctx.fullSource, o),
    verifyRecitalPresence: (o: string) => verifyRecitalInSource(ctx.fullSource, o),
    consequenceTails: (o: string) => consequenceTailsAfter(ctx.fullSource, o),
  }) } : {}),
} as VerdictInputs);

// Pin to the card-202 authoring fixture (PRE-tristate): its §L/§M are NOT pre-grounded, so the procedural-OFF
// INCOMPLETE cases stay meaningful. The card-210 record (AUDIT_ELIGIBLE_TRISTATE=true) has §L/§M pre-grounded;
// a bare `.sort().pop()` would grab it and mask the ungrounded cases. Pin by captured-flag.
const rf = readdirSync("scripts/audit-ai/run-records")
  .filter((x) => x.includes("SP3300") && x.endsWith(".json"))
  .filter((x) => JSON.parse(readFileSync("scripts/audit-ai/run-records/" + x, "utf8")).meta?.flags?.AUDIT_ELIGIBLE_TRISTATE !== "true")
  .sort().pop();
// A fixture this suite cannot find is "could not run", NOT "ran and was wrong". Exiting 1 here spent a
// triage pass reading this gate as an engine failure — it is the "passes only on the author's machine"
// class, and the repo already has one exit code for it. EXIT_CORPUS_ABSENT (3) is reported by self-audit
// as a SKIP BY NAME: never a pass, never silent.
if (!rf) {
  console.log("○ SKIP — procedural-coverage: no SP3300 run record with AUDIT_ELIGIBLE_TRISTATE!=true present.");
  console.log("  The banked corpus is intentionally untracked (government email addresses; this repo is public).");
  console.log("  Restore it or run paid-run.ts. Not a pass. This suite asserted NOTHING on this run.");
  process.exit(EXIT_CORPUS_ABSENT);
}
const rec = JSON.parse(readFileSync("scripts/audit-ai/run-records/" + rf, "utf8"));
const ctx: AuditToolContext = { fullSource: rec.input.fullSource };
const required = buildManifest(ctx);
const sr = new Set<string>(rec.result.sectionsRead);
const recFindings = (): TypedFinding[] => rec.result.findings.map((f: any) => ({ ...f }));
const covComplete = (fs: TypedFinding[]) => { const { missing } = completenessOf(ctx, required, fs, sr); return missing.length === 0 && required.length > 0; };
const cover = (fs: TypedFinding[], s: Set<string> = sr) => completenessOf(ctx, required, fs, s) as unknown as { missing: string[]; attestations: unknown[] };

async function main() {
  // The pass (deterministic default) grounds §L/§M — part12-commercial doc.
  const proc = await proceduralCoveragePass(ctx);
  ok("pass emits procedural findings on a part12 doc", proc.length > 0);
  ok("all findings are kind=procedural_obligation", proc.every((f) => f.kind === "procedural_obligation"));
  ok("all bidder_controls, grounded, no cautionFloor/requiredAttribute", proc.every((f) => f.controllability === "bidder_controls" && f.grounded && !f.cautionFloor && !f.requiredAttribute));
  ok("every excerpt is VERBATIM in its section (Rule-64)", proc.every((f) => { const sec = f.citation.match(/§([A-M])/)?.[1] ?? ""; return readSection(ctx, sec).text.replace(/\s+/g, " ").toLowerCase().includes(f.excerpt.replace(/\s+/g, " ").toLowerCase()); }));

  // (a) BOTH flags ON → the ruled target end-state, measured through the PRODUCTION input shape (coverageV2).
  await withEnv({ AUDIT_PROCEDURAL_COVERAGE_LENS: "true", AUDIT_ELIGIBLE_TRISTATE: "true" }, () => {
    const fs = [...recFindings(), ...proc];
    const c = cover(fs);
    // Coverage does NOT complete on this record and is no longer required to: §B/§C/§M are refused by later
    // floors (§C by name, by the live-armed covered_direct HARD-BAR floor). Rule 70 caps the committal and NAMES
    // the item instead of muting — that is the property worth pinning, so pin it directly.
    ok("a §C is the named uncovered item (covered_direct hard-bar floor, not a silent drop)", c.missing.includes("C"));
    const d = deriveVerdict(vin(orch(fs, null), covComplete(fs), c.attestations));
    eq("a verdict=BID_WITH_CAUTION (Rule 70 cap-not-mute, NOT muted to INCOMPLETE)", d.verdict, "BID_WITH_CAUTION");
    eq("a eligible=null", d.eligible, null);
    ok("a the uncovered item is NAMED in the reason (never a bare manifest complaint)", /CAUTION/.test(d.reason) && /§C/.test(d.reason));
    ok("a WOSB gate_to_clear", d.dispositions.some((f) => f.requiredAttribute === "setaside:WOSB" && f.disposition === "gate_to_clear"));
    ok("a mandatory WOSB verify-caution", /ELIGIBILITY NOT VERIFIED/.test(d.reason) && /WOSB/i.test(d.reason));
  });
  // baseline: procedural OFF. RE-BASELINED — the old "⇒ INCOMPLETE" contrast is MEASURED FALSE here (header note):
  // §L is covered by the ledger demotion with or without the pass, so the verdict is the same committal cap. What
  // is still true and worth pinning is that turning the pass off never IMPROVES the verdict.
  await withEnv({ AUDIT_PROCEDURAL_COVERAGE_LENS: undefined, AUDIT_ELIGIBLE_TRISTATE: "true" }, () => {
    const fs = recFindings(); // no procedural
    const c = cover(fs);
    const d = deriveVerdict(vin(orch(fs, null), covComplete(fs), c.attestations));
    eq("baseline procedural-OFF verdict is the same capped committal (pass adds no false green)", d.verdict, "BID_WITH_CAUTION");
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
    // RE-BASELINED — the wiring's job is to lift §L/§M out of the 'unread' gate, NOT to complete coverage: §B/§C/§M
    // are refused downstream by later floors on their own merits. Asserting missing=[] asserted those floors away.
    ok("d with the wiring fix → §L is no longer 'unread'-missing", before.includes("L") && !after.includes("L"));
    eq("d the wiring changes ONLY the unread gate (the floors' own refusals survive)", after, cover(fs).missing);
  }

  console.log(`procedural-coverage gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
  console.log("✅ ALL PASS — Part-12 procedural pass grounds §L/§M and lifts them out of the unread gate; the verdict caps at BID_WITH_CAUTION with the uncovered §C item NAMED (Rule 70, not muted); flag-OFF inert; procedural class is coverage-only (never a bar/eligibility input).");
  process.exit(0);
}
main();
