// ── A4 · COLLATERAL INVENTORY (Brain step-4 ruling item 3; doctrine L40-D2) ─────────────────────────────────
// "Retiring any control requires an EXECUTED INVENTORY of everything that dies with it, produced BEFORE the
//  retirement design is ruled on. Enumerate by EXECUTION, not by grep. No silent deaths."
//
// METHOD — for each candidate control, and for each veto state (INTACT vs RETIRED), measure whether toggling the
// control changes ANY verdict/reason/disposition across every banked run-record. Each configuration is measured
// in its OWN CHILD PROCESS, because some flags (GATE_V2_ENABLED) are captured at MODULE LOAD and an in-process
// toggle would silently measure the wrong thing — the exact defect class A5/D3 exists to prevent.
//
// CLASSIFICATION
//   DIES WITH THE VETO  — has effect while the veto is INTACT, and NO effect once it is RETIRED
//   SURVIVES            — has effect in both states
//   ALREADY INERT       — no effect in either state (a finding in its own right: an armed flag doing nothing)
//   NEWLY ACTIVE        — no effect intact, effect once retired (unexpected; flagged loudly)
//
// Baseline configuration is LIVE PARITY (the worker's armed set), per rule D3.
//   npx tsx scripts/audit-ai/_a4-collateral-inventory.ts
import { execFileSync } from "child_process";
import * as crypto from "crypto";
import * as path from "path";

// Live worker parity — verified via `railway variables --service audit-worker --kv` on 2026-07-22.
// D3: re-verify before relying on this; drift here silently reintroduces a non-parity measurement.
const LIVE_PARITY: Record<string, string> = {
  AUDIT_GATE_V2: "true",
  AUDIT_AMBIGUOUS_SIGNAL_DEMOTION: "true",
  AUDIT_COVERED_DIRECT_BAR_FLOOR: "true",
  AUDIT_ELIG_BAR_PASSIVE_FRAME: "true",
  AUDIT_SELF_CLEARABLE_PACKAGE: "true",
};

// Candidate controls: every flag whose logic feeds — directly or indirectly — the coverage ledger's
// `disqualifierUncovered` bucket, i.e. everything plausibly downstream of the verbatim veto.
const CANDIDATES = [
  "AUDIT_COVERED_DIRECT_BAR_FLOOR",     // #557 covered_direct hard-bar floor (LIVE-ARMED)
  "AUDIT_ELIG_BAR_PASSIVE_FRAME",       // Phase-5 passive-frame eligibility bar (LIVE-ARMED)
  "AUDIT_AMBIGUOUS_SIGNAL_DEMOTION",    // #459/#460 ambiguous→signal demotion (LIVE-ARMED)
  "AUDIT_BENIGN_RECITAL_COVERED",       // #572 benign recital
  "AUDIT_PERFORMANCE_UPKEEP_CAVEAT",    // #576 performance-upkeep caveat
  "AUDIT_CREDENTIAL_CONDITIONAL_REASON",// #575b credential-conditional reason
  "AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS",   // LPTA eval-consequence release
  "AUDIT_LEDGER_BROAD_AMBIGUOUS",       // broad-ambiguous ledger demotion
  "AUDIT_BOND_PAPER_NONBAR",            // #587b bond-paper token collision
  "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD", // Brain step-4 item 2 (built today)
  "AUDIT_COVERAGE_NHR_STOPPER_FILL",    // #472 seam fill — fires ONLY on the coverage-NHR cap
];

const SNAPSHOT = path.join(__dirname, "_a4-snapshot.ts");
const run = (env: Record<string, string>): string => {
  const out = execFileSync("npx", ["tsx", SNAPSHOT], {
    env: { ...process.env, ...LIVE_PARITY, ...env }, maxBuffer: 1024 * 1024 * 64, encoding: "utf8",
  });
  return crypto.createHash("sha256").update(out).digest("hex").slice(0, 16);
};

const VETO_STATES: Array<[string, Record<string, string>]> = [
  ["INTACT",  { AUDIT_RETIRE_VERBATIM_VETO: "false" }],
  ["RETIRED", { AUDIT_RETIRE_VERBATIM_VETO: "true" }],
];

console.log("── A4 COLLATERAL INVENTORY — executed, live-parity baseline ──");
console.log(`candidates: ${CANDIDATES.length} · configurations to measure: ${CANDIDATES.length * 2 + 2}\n`);

const baseline: Record<string, string> = {};
for (const [state, env] of VETO_STATES) {
  baseline[state] = run(env);
  console.log(`baseline[${state}] = ${baseline[state]}`);
}
console.log(`\nveto itself changes the corpus: ${baseline.INTACT !== baseline.RETIRED ? "YES ✅ (the veto is load-bearing)" : "NO ⚠"}\n`);

type Row = { flag: string; effectIntact: boolean; effectRetired: boolean; verdict: string };
const rows: Row[] = [];
for (const flag of CANDIDATES) {
  const eff: Record<string, boolean> = {};
  for (const [state, env] of VETO_STATES) {
    // toggle the candidate AGAINST the baseline value for this state
    const onHash = run({ ...env, [flag]: "true" });
    const offHash = run({ ...env, [flag]: "false" });
    eff[state] = onHash !== offHash;
  }
  const verdict =
    eff.INTACT && !eff.RETIRED ? "☠ DIES WITH THE VETO"
    : eff.INTACT && eff.RETIRED ? "SURVIVES"
    : !eff.INTACT && eff.RETIRED ? "⚠ NEWLY ACTIVE (unexpected)"
    : "○ ALREADY INERT (armed but doing nothing on this corpus)";
  rows.push({ flag, effectIntact: eff.INTACT, effectRetired: eff.RETIRED, verdict });
  console.log(`${flag.padEnd(38)} intact=${String(eff.INTACT).padEnd(5)} retired=${String(eff.RETIRED).padEnd(5)} → ${verdict}`);
}

console.log("\n" + "═".repeat(78));
const dies = rows.filter((r) => r.verdict.includes("DIES"));
const inert = rows.filter((r) => r.verdict.includes("INERT"));
console.log(`DIES WITH THE VETO: ${dies.length}${dies.length ? " → " + dies.map((r) => r.flag).join(", ") : ""}`);
console.log(`ALREADY INERT:      ${inert.length}${inert.length ? " → " + inert.map((r) => r.flag).join(", ") : ""}`);
console.log(`SURVIVES:           ${rows.filter((r) => r.verdict === "SURVIVES").length}`);
// ── ⚠ HARNESS BLIND SPOT — DO NOT READ THE ROWS ABOVE AS "THE FLAG DOES NOTHING" ────────────────────────────
// MEASURED FACT about this harness (verified 2026-07-22): 30 of the 40 banked run-records carry a PRE-COMPUTED
// `coverageV2` in `result.inputs`, and ZERO carry raw section attestations. `deriveVerdict` therefore CONSUMES a
// frozen ledger — so every flag whose logic runs while the ledger is BUILT (`gradeCoverageV2` · `importanceOf` ·
// `hasBarSignal` · the whole demotion family · the covered_direct / passive-frame emitters upstream) is INVISIBLE
// to phase 1 BY CONSTRUCTION. Reporting those rows as "already inert" would be a placebo-instrument defect (D3) —
// absence of measurement reported as evidence of safety, the exact error A5 was ordered to fix one layer up.
// Phase 1's rows are trustworthy ONLY for controls acting at verdict time (the veto itself, the stopper fill).
console.log("\n" + "═".repeat(78));
console.log("⚠ PHASE-1 SCOPE: verdict-time controls ONLY. 30/40 records carry a FROZEN coverageV2 and 0 carry raw");
console.log("  attestations, so ledger-BUILD-time flags are structurally invisible above — those rows read");
console.log("  'ALREADY INERT' because the harness cannot see them. They are UNMEASURED, not inert (D3).");

// ── PHASE 2 · LEDGER-BUILD LAYER — measure the classification the frozen records hide ───────────────────────
// Mine real obligation sentences from every record's SOURCE using the orchestrator's own extractor, then measure
// whether each build-time flag changes the classification vector. This is the layer phase 1 cannot reach.
(async () => {
  const fs2 = await import("fs");
  const { importanceOf, hasBarSignal } = await import("../../src/lib/audit-gate-v2");
  const DIR = path.join(__dirname, "run-records");
  // obligationsOf replicated VERBATIM from audit-orchestrator.ts (it is not exported).
  const obligationsOf = (text: string) => text.split(/(?<=[.;\n])/).map((s) => s.trim())
    .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s));

  const obligations: string[] = [];
  for (const f of fs2.readdirSync(DIR).filter((x) => x.endsWith(".run-record.json")).sort()) {
    try {
      const rec = JSON.parse(fs2.readFileSync(path.join(DIR, f), "utf8"));
      const src = rec?.result?.inputs?.source || rec?.input?.fullSource || "";
      if (src) obligations.push(...obligationsOf(src));
    } catch { /* skip */ }
  }
  const uniq = [...new Set(obligations)];
  console.log(`\n── PHASE 2 · ledger-build layer — ${uniq.length} distinct real obligation sentences mined from the corpus ──`);

  const classify = () => uniq.map((o) => `${importanceOf(o)}|${hasBarSignal(o)}`).join(";");
  const BUILD_FLAGS = CANDIDATES.filter((f) => f !== "AUDIT_COVERAGE_NHR_STOPPER_FILL");
  const rows2: Array<{ flag: string; moved: number }> = [];
  for (const flag of BUILD_FLAGS) {
    const prev = process.env[flag];
    process.env[flag] = "false"; const off = classify();
    process.env[flag] = "true";  const on = classify();
    if (prev === undefined) delete process.env[flag]; else process.env[flag] = prev;
    const moved = off === on ? 0 : off.split(";").filter((v, i) => v !== on.split(";")[i]).length;
    rows2.push({ flag, moved });
    console.log(`${flag.padEnd(38)} obligations reclassified: ${moved === 0 ? "0  ○ no effect on this corpus" : `${moved}  ● ACTIVE at build time`}`);
  }
  const active = rows2.filter((r) => r.moved > 0);
  console.log(`\nBUILD-TIME ACTIVE: ${active.length}${active.length ? " → " + active.map((r) => `${r.flag}(${r.moved})`).join(", ") : ""}`);
  console.log("A flag ACTIVE at build time but invisible at verdict time is the collateral class: its work lands in");
  console.log("`disqualifierUncovered`, which retirement de-authorizes — i.e. it DIES WITH THE VETO even though");
  console.log("phase 1 cannot see it. Each still requires an explicit disposition (L40-D2): keep-alive or ruled retirement.");
  console.log("\nEach DIES entry requires an explicit disposition before retirement may be ruled on:");
  console.log("  keep-alive path, or explicitly ruled retirement. NO SILENT DEATHS (L40-D2).");
})();
