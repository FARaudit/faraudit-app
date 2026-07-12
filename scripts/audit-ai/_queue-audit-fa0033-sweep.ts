// $0 SOURCE-FETCH QUEUE-AUDIT (card #457 step 2) — enumerate EVERY ungrounded §L/§M obligation across the 3
// FA813726R0033 paid runs (bd605b88·64b79916·66897b8a), classify each with the REAL importanceOf (all 5 allow-
// list entries ON), and decide entries-vs-structural. All 3 runs are the SAME solicitation, so the §L/§M
// ungrounded pool is a FIXED, enumerable set. Residuals that classify "ambiguous" are the future cycling
// drivers; "boilerplate" = already handled by an entry; "disqualifier" = a real bar (correct NHR).
//
// Flags ON (flip-set): every NOOP_REP_FAMILY member + GATE_V2 + COVERAGE_LEDGER_V2.
process.env.GATE_V2 = "true";
process.env.AUDIT_COVERAGE_LEDGER_V2 = "true";
process.env.AUDIT_PROTEST_CLAUSE_ALLOWLIST = "true";
process.env.AUDIT_DEBRIEF_ALLOWLIST = "true";
process.env.AUDIT_NOOP_REP_ALLOWLIST = "true";
process.env.AUDIT_PRECEDENCE_ALLOWLIST = "true";
process.env.AUDIT_CLARIFICATION_ALLOWLIST = "true";

import { readFileSync } from "node:fs";

const RECORDS = [
  "scripts/audit-ai/run-records/FA813726R0033.bd605b88-1f32-4a37-8698-a79fae142e30.run-record.json",
  "scripts/audit-ai/run-records/FA813726R0033.64b79916-fd20-4359-b0aa-4979bce2d78a.run-record.json",
  "scripts/audit-ai/run-records/FA813726R0033.66897b8a-0e19-4669-9bc2-541cf31dabe9.run-record.json",
];

(async () => {
  const { replayRunRecord } = await import("../../src/lib/audit-run-record");
  const { importanceOf } = await import("../../src/lib/audit-gate-v2");
  const { loadRunRecord } = await import("./run-record-io");

  // dedupe across runs (same sol → near-identical §L/§M pool). Key by section + normalized obligation.
  const seen = new Map<string, { section: string; ob: string; klass: string; runs: string[] }>();

  for (const path of RECORDS) {
    const runId = path.split(".")[1].slice(0, 8);
    const rec = loadRunRecord(path);
    const r = replayRunRecord(rec, {
      sectionMDepth: rec.meta.flags?.AUDIT_SECTION_M_DEPTH === "true",
      commercialHonestFail: rec.meta.flags?.AUDIT_PROCUREMENT_TYPE_SECTIONS === "true",
    });
    for (const s of r.sections) {
      if (s.section !== "L" && s.section !== "M") continue;
      for (const ob of s.ungrounded) {
        if (/^\[(truncated|compressor-dropped)\]/i.test(ob)) continue; // structural markers, not benign strings
        const klass = importanceOf(ob);
        const key = `${s.section}::${ob.slice(0, 120).toLowerCase().replace(/\s+/g, " ").trim()}`;
        const prev = seen.get(key);
        if (prev) { if (!prev.runs.includes(runId)) prev.runs.push(runId); }
        else seen.set(key, { section: s.section, ob, klass, runs: [runId] });
      }
    }
    // also surface the section status + counts as the run saw it
    const lm = r.sections.filter((s) => s.section === "L" || s.section === "M")
      .map((s) => `§${s.section} [${s.status}] oblig=${s.obligations} grounded=${s.grounded} ungrounded=${s.ungroundedCount}`);
    console.log(`\n── run ${runId} · verdict=${r.verdict ?? r.verdictReproduced ?? "?"} ──`);
    for (const l of lm) console.log("   " + l);
  }

  const all = [...seen.values()];
  const by = (k: string) => all.filter((x) => x.klass === k);
  const boiler = by("boilerplate"), ambig = by("ambiguous"), disq = by("disqualifier");

  console.log("\n\n════════ AGGREGATE ungrounded §L/§M pool (deduped across 3 runs, all 5 entries ON) ════════");
  console.log(`total distinct ungrounded §L/§M obligations: ${all.length}`);
  console.log(`  boilerplate  (HANDLED by an entry, won't cycle): ${boiler.length}`);
  console.log(`  disqualifier (REAL bar → correct NHR)          : ${disq.length}`);
  console.log(`  ambiguous    (RESIDUAL → potential cycling driver): ${ambig.length}`);

  const dump = (label: string, arr: typeof all) => {
    console.log(`\n──── ${label} (${arr.length}) ────`);
    for (const x of arr) console.log(`  §${x.section} [${x.runs.join(",")}] ${x.ob.slice(0, 200)}`);
  };
  dump("RESIDUALS — ambiguous (decision-driving)", ambig);
  dump("disqualifier — real bars (verify these ARE grounded elsewhere / correct)", disq);
  dump("boilerplate — already laundered by an entry", boiler);
})();
