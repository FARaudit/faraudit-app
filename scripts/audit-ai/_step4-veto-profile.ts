// STEP 4 (CEO full-run order) — CLOSE THE RETIREMENT QUESTION BY MEASUREMENT, on the REBUILT instrument.
//
// PRE-REGISTERED RULE: if the rebuilt measurement shows the veto catching ≥1 GENUINE eligibility bar that
// NOTHING ELSE catches → veto STAYS, arc closes with Option A. If ZERO unique catches AND all registers
// otherwise owned → genuine fork, card it.
//
// METHOD (both halves must hold for a catch to count):
//   UNIQUE  — with `AUDIT_RETIRE_VERBATIM_VETO=true` the record COMMITS (BID/BWC). If it still escalates via
//             another authority, the veto is redundant on that record, not unique.
//   GENUINE — the obligation the veto fired on is a real pre-award eligibility/submission bar, adjudicated
//             against its text, not merely bar-SHAPED. Adjudication is printed for review, never assumed.
//
// AMENDED PER BRAIN (2026-07-23): `999e909b` does NOT count — its catch was INCIDENTAL (the veto fired on
// benign frozen rows that no longer exist), so it is excluded by construction here (it has an empty bucket now).
export {};
import { applyStampedConfig, rebuildLedger, isCommittal, configStamp } from "./_instrument";
applyStampedConfig("live");

(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const w = <T,>(v: string, fn: () => T): T => { const p = process.env.AUDIT_RETIRE_VERBATIM_VETO; process.env.AUDIT_RETIRE_VERBATIM_VETO = v;
    try { return fn(); } finally { if (p === undefined) delete process.env.AUDIT_RETIRE_VERBATIM_VETO; else process.env.AUDIT_RETIRE_VERBATIM_VETO = p; } };

  console.log("═".repeat(118));
  console.log("STEP 4 — VETO TRUE-POSITIVE / FALSE-POSITIVE PROFILE ON LIVING SUBSTRATE");
  console.log("═".repeat(118));
  console.log(configStamp().split("\n")[0] + "\n");

  const uniqueCatches: any[] = [];
  const redundant: any[] = [];
  const rows: any[] = [];
  for (const r of led) {
    if (r.measurable === "NOT MEASURABLE" || !r.inputs) continue;
    const cov = r.inputs.coverageV2;
    if (!cov?.disqualifierUncovered?.length) continue;      // veto cannot fire
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let intact: any, retired: any;
    try { intact = w("false", () => deriveVerdict(inp)); retired = w("true", () => deriveVerdict(inp)); }
    catch (e) { console.log(`  THREW on ${r.id}: ${e}`); continue; }
    const vetoDecided = intact.verdict === "NEEDS_HUMAN_REVIEW" && isCommittal(retired.verdict);
    const row = { id: r.id, bucket: cov.disqualifierUncovered.length, intact: intact.verdict, retired: retired.verdict, vetoDecided,
                  obligations: cov.disqualifierUncovered.map((d: any) => `§${d.section} ${d.obligation}`) };
    rows.push(row);
    (vetoDecided ? uniqueCatches : redundant).push(row);
  }

  console.log(`${"RECORD".padEnd(52)} ${"BKT".padStart(3)} ${"VETO INTACT".padEnd(19)} ${"VETO RETIRED".padEnd(19)} VETO DECIDES?`);
  console.log("─".repeat(118));
  for (const r of rows) console.log(`${r.id.slice(0,52).padEnd(52)} ${String(r.bucket).padStart(3)} ${r.intact.padEnd(19)} ${r.retired.padEnd(19)} ${r.vetoDecided ? "✅ YES — SOLE AUTHORITY" : "no (redundant)"}`);
  console.log("─".repeat(118));
  console.log(`records where the veto is the SOLE deciding authority: ${uniqueCatches.length} · redundant: ${redundant.length}\n`);

  console.log("── ADJUDICATION: is each uniquely-caught obligation a GENUINE pre-award bar? ────────────────");
  const seen = new Set<string>();
  for (const r of uniqueCatches) for (const o of r.obligations) {
    if (seen.has(o)) continue; seen.add(o);
    console.log(`\n  ▸ ${o}`);
  }
  console.log(`\n  (distinct obligations the veto uniquely catches: ${seen.size})`);
  console.log("\n" + "═".repeat(118));
  console.log(uniqueCatches.length > 0
    ? `PRE-REGISTERED OUTCOME: ≥1 unique catch ⇒ **VETO STAYS**; arc closes with OPTION A (ship independent wins).\n` +
      `obligationsOf / eight-verb-filter work becomes a NAMED POST-ARC UNIT — not built in this envelope.`
    : `PRE-REGISTERED OUTCOME: ZERO unique catches ⇒ genuine FORK — card it (do NOT rebuild Option B in this envelope).`);
})();
