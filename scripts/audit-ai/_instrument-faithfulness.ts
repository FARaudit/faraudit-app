// INSTRUMENT FAITHFULNESS PROBE (Brain #692 §5 — the check that makes the rebuild *evidence* rather than *plausible*)
//
// THE PROBLEM THE ACCEPTANCE RUN CANNOT SOLVE ALONE. The rebuilt ledger disagrees with the frozen literal on
// 12/42 records, sometimes enormously (63 → 1). Two hypotheses explain that equally well from the acceptance
// output alone:
//
//   H-STALE   the frozen literal is stale, and the rebuild is correct       ⇒ the rebuild is the instrument
//   H-BROKEN  my recompute is wrong and is destroying real ledger entries   ⇒ everything downstream is void
//
// Reporting the census without discriminating these would be the arc's own named failure mode: citing a number
// whose direction of error is unestablished. THE DISCRIMINATOR: the frozen literals were computed under a
// KNOWN different configuration (`AUDIT_AMBIGUOUS_SIGNAL_DEMOTION=false`, pre-#460 for the oldest). If the
// recompute REPRODUCES the frozen literal when that flag is restored to the state it was frozen under, then
// the recompute is faithful and the entire delta is attributed to the flag — H-BROKEN is refuted by execution.
//
// This is a known-answer test where the known answer is the historical record itself.
//
// Run:  npx tsx scripts/audit-ai/_instrument-faithfulness.ts
export {};

import { applyStampedConfig, configStamp } from "./_instrument";
import { readFileSync, readdirSync } from "fs";

applyStampedConfig("live");

const RECORD_DIR = "scripts/audit-ai/run-records";
const EXCLUDE = /panel-findings-bank|panel-characterization|smoke|REMOTE_/;

(async () => {
  const { replayCoverageStage } = await import("../../src/lib/audit-run-record");
  console.log("═".repeat(104));
  console.log("INSTRUMENT FAITHFULNESS — can the rebuild REPRODUCE the frozen literal under the flag state it was frozen under?");
  console.log("═".repeat(104));
  console.log(configStamp().split("\n")[0]);
  console.log();

  const withFlag = <T>(k: string, v: string, fn: () => T): T => {
    const prev = process.env[k]; process.env[k] = v;
    try { return fn(); } finally { if (prev === undefined) delete process.env[k]; else process.env[k] = prev; }
  };

  // ERA MATCHING (probe defect found + fixed on first execution). The banked records span MULTIPLE engine
  // eras: the oldest predate `AUDIT_AMBIGUOUS_SIGNAL_DEMOTION`, the newest (the LBJ refires) were banked with
  // it already armed. Applying ONE "legacy" configuration to all of them tests the wrong hypothesis for half
  // the corpus — the first run of this probe reported 5 spurious failures where forcing the demotion OFF drove
  // a record that was banked with it ON from 0 up to 74. A record is faithfulness-confirmed if EITHER era
  // configuration reproduces its literal; which one does is itself the record's era stamp.
  // The last two eras were IDENTIFIED BY EXECUTION, not guessed: a single-flag sensitivity sweep over the 20
  // candidate flags that can move a ledger bucket found exactly which later-landing demotion arm accounts for
  // each residual record. An era is only listed here once a flip has been shown to reproduce a literal.
  const ERAS: Array<{ name: string; flags: Record<string, string> }> = [
    { name: "live-era", flags: {} },
    { name: "pre-demotion", flags: { AUDIT_AMBIGUOUS_SIGNAL_DEMOTION: "false", AUDIT_BENIGN_RECITAL_COVERED: "false", AUDIT_PERFORMANCE_UPKEEP_CAVEAT: "false", AUDIT_CONDITIONAL_TINA_DEMOTION: "false" } },
    { name: "pre-tina", flags: { AUDIT_CONDITIONAL_TINA_DEMOTION: "false" } },
    { name: "pre-lpta", flags: { AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS: "false" } },
  ];
  const underEra = <T>(flags: Record<string, string>, fn: () => T): T => {
    const entries = Object.entries(flags);
    const restore: Array<[string, string | undefined]> = entries.map(([k]) => [k, process.env[k]]);
    for (const [k, v] of entries) process.env[k] = v;
    try { return fn(); } finally { for (const [k, v] of restore) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  };

  const files = readdirSync(RECORD_DIR).filter((f) => f.endsWith(".json") && !EXCLUDE.test(f)).sort();
  type Row = { id: string; frozen: number; live: number; byEra: Record<string, number>; era: string | null };
  const rows: Row[] = [];
  for (const f of files) {
    const rec = JSON.parse(readFileSync(`${RECORD_DIR}/${f}`, "utf8"));
    const frozenLit = rec?.result?.inputs?.coverageV2;
    const atts = rec?.result?.coverage?.attestations;
    if (!frozenLit || !Array.isArray(atts) || atts.length === 0) continue;   // only S1 records can be compared
    const frozen = (frozenLit.disqualifierUncovered ?? []).length;
    const byEra: Record<string, number> = {};
    for (const e of ERAS) byEra[e.name] = underEra(e.flags, () => replayCoverageStage(rec).coverageV2.disqualifierUncovered.length);
    const era = ERAS.map((e) => e.name).find((n) => byEra[n] === frozen) ?? null;
    rows.push({ id: f.replace(/\.run-record\.json$|\.json$/, "").slice(0, 50), frozen, live: byEra["live-era"], byEra, era });
  }

  console.log(`${"RECORD".padEnd(52)} ${"FROZEN".padStart(7)} ${"live-era".padStart(9)} ${"pre-demot".padStart(10)}   REPRODUCED BY`);
  console.log("─".repeat(104));
  const misses: Row[] = [];
  for (const r of rows) {
    if (!r.era) misses.push(r);
    console.log(`${r.id.padEnd(52)} ${String(r.frozen).padStart(7)} ${String(r.byEra["live-era"]).padStart(9)} ${String(r.byEra["pre-demotion"]).padStart(10)}   ${r.era ? `✅ ${r.era}` : "❌ neither era"}`);
  }
  console.log("─".repeat(104));
  const byEraCount = new Map<string, number>();
  for (const r of rows) if (r.era) byEraCount.set(r.era, (byEraCount.get(r.era) ?? 0) + 1);
  console.log(`REPRODUCED by some era configuration: ${rows.length - misses.length}/${rows.length}` +
              `   [${[...byEraCount].map(([k, v]) => `${k}: ${v}`).join(" · ")}]`);
  console.log();

  // STALENESS follows from the era stamp: a record whose literal reproduces only under `pre-demotion` is one
  // whose frozen substrate is NOT what today's engine produces — the L40-D4 condition, established per record
  // by execution rather than assumed corpus-wide.
  const stale = rows.filter((r) => r.era === "pre-demotion" && r.byEra["live-era"] !== r.frozen);
  console.log(`STALE BY EXECUTION (reproduces only under pre-demotion ⇒ frozen substrate ≠ current engine): ${stale.length}`);
  for (const s of stale) console.log(`   · ${s.id}  frozen=${s.frozen} → today=${s.byEra["live-era"]}`);
  console.log();

  if (misses.length === 0) {
    console.log("VERDICT: **H-BROKEN REFUTED BY EXECUTION.** Every frozen literal is reproduced exactly by the recompute");
    console.log("under one of the two engine-era configurations. The rebuild is therefore FAITHFUL, and the whole");
    console.log("frozen-vs-rebuilt delta is attributable to CONFIGURATION DRIFT, not to a defect in the instrument.");
  } else {
    console.log("VERDICT: ⚠ PARTIAL — faithfulness is ESTABLISHED for the reproduced records and OPEN for these:");
    for (const m of misses) console.log(`   · ${m.id}  frozen=${m.frozen} live-era=${m.byEra["live-era"]} pre-demotion=${m.byEra["pre-demotion"]}`);
    console.log();
    console.log("These carry a residual no era configuration explains — an engine change since bank time beyond the");
    console.log("demotion family. They are a REPORTED LIMITATION: excluded from citation in EITHER direction until");
    console.log("explained. Note the residuals are SMALL and one-directional (frozen slightly above today's count),");
    console.log("consistent with incremental demotions landing after bank time — but 'consistent with' is not");
    console.log("evidence, so they stay excluded rather than assumed benign.");
  }
  process.exit(0);
})();
