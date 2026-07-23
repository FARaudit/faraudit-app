// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// POST-ARM VERIFICATION SET  (CEO order A3 · Verdict Arc v2 package #1)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// PURPOSE. Produce the EXPECTED-DELTA LIST for the six-flag arm BEFORE the CEO arms, then re-run it AFTER the
// arm so "what actually happened" is compared against a PRE-REGISTERED prediction rather than a
// post-hoc rationalisation. A prediction written after the fact is not a prediction.
//
// WHAT IT DOES NOT DO. It arms nothing and fires nothing. Every configuration below is applied to
// `process.env` INSIDE THIS PROCESS ONLY, against banked run-records. $0. No network, no worker, no paid run.
//
// RUN:  npx tsx scripts/audit-ai/_postarm-verify.ts
//
// ── THE CONFIGURATIONS ──────────────────────────────────────────────────────────────────────────────────────
//   BASELINE   live worker parity, all arc flags OFF          = what customers get RIGHT NOW
//   ARMED-6    baseline + the six flags on the arm card       = what customers get AFTER the CEO's batch-arm
//   +TEMPORAL  ARMED-6 + AUDIT_TEMPORAL_VERDICT               = DECISION SUPPORT ONLY (see the banner below)
//
// ── THE ACCEPTANCE RULE (pre-registered, do not soften after seeing the output) ──────────────────────────────
//   R1  FALSE-BIDs = 0 in ARMED-6.                             CARDINAL — a breach is a full stop, not a note.
//   R2  No escalation→committal flip in ARMED-6 that is not itemised and defended here.
//   R3  Every delta ARMED-6 vs BASELINE is enumerated by id. No aggregate-only reporting; no silent absorption.
//   R4  `THREW` count = 0.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
export {};
import { applyStampedConfig, rebuildLedger, isCommittal, configStamp } from "./_instrument";

applyStampedConfig("live");

/** THE ARM CARD'S SIX — exactly the batch in ARM-CARD-VERDICT-ARC-V2.md §7.3. Nothing may be added to this
 *  array. Widening an arm set is a CEO decision (standing order G1/G4), never a script's. */
const ARMED_SIX = [
  "AUDIT_SETASIDE_BACKSTOP",
  "AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM",
  "AUDIT_BANNER_BAR_RANKING",
  "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD",
  "AUDIT_BAR_SIGNAL_REGISTER_TOKENS",
  "AUDIT_INCOMPLETE_PRECEDENCE",
] as const;

/** ⛔ DO-NOT-ARM (standing order G4). Present here ONLY so the run asserts they are OFF in every configuration
 *  it measures — a verification set that could silently measure them armed would be worse than none. */
const FORBIDDEN = ["AUDIT_VETO_NARROW_UNIVERSAL", "AUDIT_RETIRE_VERBATIM_VETO"] as const;

(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const led = await rebuildLedger();
  const measurable = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);

  const verdictsUnder = (cfg: Record<string, string>) => {
    const prev: Array<[string, string | undefined]> = Object.keys(cfg).map((k) => [k, process.env[k]]);
    for (const [k, v] of Object.entries(cfg)) process.env[k] = v;
    try {
      // FORBIDDEN guard runs INSIDE the applied configuration — checking before the apply would prove nothing.
      for (const f of FORBIDDEN) {
        if (process.env[f] === "true") {
          console.error(`❌ HARD EXIT — DO-NOT-ARM flag ${f} is true in a measured configuration (order G4).`);
          process.exit(3);
        }
      }
      return measurable.map((r) => {
        const inp = {
          ...r.inputs,
          findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], {
            enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true",
          }),
        };
        try {
          const d = deriveVerdict(inp);
          return { id: r.id, v: d.verdict as string, reason: String(d.reason ?? ""), inp };
        } catch (e) {
          return { id: r.id, v: "THREW", reason: String(e), inp };
        }
      });
    } finally {
      for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  };

  const off = (ks: readonly string[]) => Object.fromEntries(ks.map((k) => [k, "false"]));
  const on = (ks: readonly string[]) => Object.fromEntries(ks.map((k) => [k, "true"]));

  const ALL_ARC = [...ARMED_SIX, ...FORBIDDEN, "AUDIT_TEMPORAL_VERDICT"];

  const CONFIGS: Array<{ name: string; cfg: Record<string, string>; graded: boolean }> = [
    { name: "BASELINE  (live parity · arc flags OFF)", cfg: off(ALL_ARC), graded: false },
    { name: "ARMED-6   (the CEO's batch-arm)", cfg: { ...off(ALL_ARC), ...on(ARMED_SIX) }, graded: true },
    { name: "+TEMPORAL (⛔ NON-EVIDENCE — see the banner printed with this block)", cfg: { ...off(ALL_ARC), ...on(ARMED_SIX), AUDIT_TEMPORAL_VERDICT: "true" }, graded: false },
  ];

  console.log("═".repeat(112));
  console.log(`POST-ARM VERIFICATION SET — ${measurable.length} measurable records · ${led.length} banked`);
  console.log(configStamp());
  console.log("═".repeat(112));

  const results = CONFIGS.map((c) => ({ ...c, out: verdictsUnder(c.cfg) }));
  const baseline = new Map(results[0].out.map((o) => [o.id, o.v]));

  let hardFail = 0;
  for (const r of results) {
    const threw = r.out.filter((o) => o.v === "THREW");
    const deltas = r.out.filter((o) => baseline.get(o.id) !== o.v);
    // FALSE-BID PROXY. The banked records carry no gold expectation, so the arc's established proxy is used
    // (same rule as `_endgauntlet-matrix.ts`): a record that ESCALATED at baseline and COMMITS here is a
    // candidate false-BID. Unlike the matrix, NO id is exempted — the SP3300 exemption there was earned under
    // the retirement flags, which are DO-NOT-ARM and are off in every configuration measured here.
    const escalToCommittal = deltas.filter((o) => {
      const b = baseline.get(o.id)!;
      try { return !isCommittal(b) && isCommittal(o.v); } catch { return false; }
    });

    console.log(`\n── ${r.name} ──`);
    console.log(`   verdict deltas vs BASELINE: ${deltas.length} · escalation→committal: ${escalToCommittal.length} · THREW: ${threw.length}`);
    // R3 — itemised, never aggregate-only.
    for (const d of deltas) console.log(`     Δ ${d.id}: ${baseline.get(d.id)} → ${d.v}`);
    for (const t of threw) console.log(`     ⚠ THREW ${t.id}: ${t.reason.slice(0, 160)}`);
    for (const f of escalToCommittal) console.log(`     🔴 ESCALATION→COMMITTAL ${f.id}: ${baseline.get(f.id)} → ${f.v}`);

    if (r.graded) {
      if (escalToCommittal.length > 0) { console.log(`   ❌ R1 BREACH — escalation→committal in the armed configuration. FULL STOP.`); hardFail++; }
      if (threw.length > 0) { console.log(`   ❌ R4 BREACH — a record threw under the armed configuration.`); hardFail++; }
      if (escalToCommittal.length === 0 && threw.length === 0) console.log(`   ✅ R1 + R4 hold.`);
      console.log(`   R2/R3 — the ${deltas.length} delta(s) above are the PRE-REGISTERED expected set; any delta`);
      console.log(`           observed post-arm that is NOT in this list is a blocker, not a rounding error.`);
    } else if (r.name.startsWith("+TEMPORAL")) {
      // FORMAL EVIDENCE RULING — Brain, card #700, Jul 23 2026. Printed with the numbers, every run, so the
      // table can never be quoted without it.
      console.log(`   ⛔ NON-EVIDENCE FOR THE TEMPORAL QUESTION — IN BOTH DIRECTIONS.`);
      console.log(`      A banked run-record CANNOT exercise a verdict-time live-SAM currency check: the gate asks`);
      console.log(`      whether the solicitation is open NOW, and a frozen record has no NOW. This corpus is`);
      console.log(`      STRUCTURALLY INCAPABLE of registering the gate's effect, so identical deltas here are`);
      console.log(`      ABSENCE OF MEASUREMENT, not evidence of inertness (the L40 placebo shape).`);
      console.log(`      Do NOT cite this block as grounds to leave AUDIT_TEMPORAL_VERDICT off, or to arm it.`);
      console.log(`      The motivating record for arming it is #667, not this table. Charter: ceo/PACKAGE-2-LIVENESS-UNIT-CHARTER.md`);
    } else {
      console.log(`   (ungraded — reference configuration)`);
    }
  }

  console.log("\n" + "═".repeat(112));
  console.log(hardFail === 0
    ? "🟢 PRE-ARM PREDICTION BANKED — re-run this file verbatim after the CEO's arm and diff the ARMED-6 block."
    : `❌ ${hardFail} HARD FAILURE(S) — the arm must not proceed until adjudicated.`);
  console.log("═".repeat(112));
  process.exit(hardFail === 0 ? 0 : 1);
})();
